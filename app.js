// --- CONFIGURACIÓN Y VARIABLES GLOBALES ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnEvaluate = document.getElementById('btnEvaluate');
const statusText = document.getElementById('status');
const audioPlayback = document.getElementById('audioPlayback');
const resultBox = document.getElementById('resultBox');
const evaluationOutput = document.getElementById('evaluationOutput');
const apiKeyInput = document.getElementById('apiKey');
const fileInput = document.getElementById('fileInput');
const taskInstructionsInput = document.getElementById('taskInstructions');

// --- 1. GUARDADO AUTOMÁTICO DE LA API KEY Y LA ÚLTIMA TAREA (LOCALSTORAGE) ---
document.addEventListener('DOMContentLoaded', () => {
    // Cargar API Key si ya existe guardada en el navegador
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
    }
    
    // Cargar la última tarea escrita para comodidad del profesor
    const savedTask = localStorage.getItem('last_task_instructions');
    if (savedTask) {
        taskInstructionsInput.value = savedTask;
        statusText.innerText = "Estado: API Key y tarea anterior cargadas de forma local.";
    } else {
        // Tarea vacía o genérica para obligar a escribir la que tú desees
        taskInstructionsInput.value = 'Escribe aquí las instrucciones de la tarea que vas a evaluar en este momento...';
    }
});

apiKeyInput.addEventListener('input', () => {
    localStorage.setItem('openai_api_key', apiKeyInput.value.trim());
});

taskInstructionsInput.addEventListener('input', () => {
    localStorage.setItem('last_task_instructions', taskInstructionsInput.value);
});


// --- 2. LÓGICA DE GRABACIÓN DE AUDIO ---
btnStart.addEventListener('click', async () => {
    audioChunks = [];
    fileInput.value = ""; 
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPlayback.src = audioUrl;
            btnEvaluate.disabled = false;
            statusText.innerText = "Estado: Grabación lista. Revisa el audio o haz clic en Evaluar.";
        };

        mediaRecorder.start();
        btnStart.disabled = true;
        btnStop.disabled = false;
        btnEvaluate.disabled = true;
        statusText.innerText = "Estado: Grabando... Habla ahora.";
    } catch (err) {
        alert("No se pudo acceder al micrófono. Por favor, verifica los permisos de tu navegador.");
        console.error(err);
    }
});

btnStop.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        btnStart.disabled = false;
        btnStop.disabled = true;
    }
});


// --- 3. LÓGICA PARA PROCESAR ARCHIVOS SUBIDOS ---
fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        audioBlob = file; 
        const audioUrl = URL.createObjectURL(file);
        audioPlayback.src = audioUrl; 
        btnEvaluate.disabled = false;
        statusText.innerText = `Estado: Archivo "${file.name}" cargado y listo para evaluar.`;
    }
});


// --- 4. CONEXIÓN CON LAS APIs DE OPENAI (WHISPER + GPT-4o) ---
btnEvaluate.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const taskInstructions = taskInstructionsInput.value.trim();

    if (!apiKey) {
        alert("Por favor, ingresa tu OpenAI API Key primero.");
        return;
    }
    if (!taskInstructions || taskInstructions.startsWith('Escribe aquí')) {
        alert("Por favor, detalla primero las instrucciones de la tarea que vas a evaluar.");
        return;
    }
    if (!audioBlob) {
        alert("Por favor, graba un audio o sube un archivo primero.");
        return;
    }

    statusText.innerText = "Procesando... Transcribiendo audio con Whisper...";
    btnEvaluate.disabled = true;

    try {
        const formData = new FormData();
        
        if (fileInput.files.length > 0) {
            const uploadedFile = fileInput.files[0];
            const extension = uploadedFile.name.split('.').pop(); 
            formData.append('file', audioBlob, `student_audio.${extension}`);
        } else {
            formData.append('file', audioBlob, 'recording.webm');
        }
        
        formData.append('model', 'whisper-1');

        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!whisperResponse.ok) {
            const errorData = await whisperResponse.json();
            throw new Error(errorData.error?.message || "Error en la transcripción.");
        }
        
        const whisperData = await whisperResponse.json();
        const studentText = whisperData.text;

        statusText.innerText = "Analizando texto con GPT-4o según criterios MCER A2...";

        // PROMPT OPTIMIZADO: Eliminada la rutina diaria. Ajustado al contexto dinámico y feedback humano.
        const prompt = `Actúa como un mentor y profesor de idiomas sumamente empático, cercano y experto en el Marco Común Europeo de Referencia (MCER). Tu objetivo es evaluar el desempeño de un estudiante de nivel A2 basándote únicamente en el audio que ha entregado.

CONTEXTO DE LA TAREA ASIGNADA AL ESTUDIANTE:
"${taskInstructions}"

TEXTO PRODUCIDO POR EL ESTUDIANTE:
"${studentText}"

PROHIBICIONES ESTRICTAS:
- NO des definiciones teóricas de los criterios del MCER (No expliques textualmente qué es "alcance léxico" o "coherencia").
- NO uses listas de viñetas frías ni lenguaje formal de manual.
- NO asumes que el estudiante está leyendo; háblale directamente sobre su grabación.

Entrega tu evaluación utilizando ESTRICTAMENTE la siguiente estructura en Markdown. Redacta los párrafos de forma fluida, natural y muy descriptiva, tal como lo haría un profesor real en un mensaje de aliento:

### 📊 Resultado General
* **Transcripción detectada**: "${studentText}"
* **Veredicto de Nivel A2**: [CUMPLE TOTALMENTE / CUMPLE PARCIALMENTE / NO CUMPLE]

---

### 💪 Fortalezas
(Escribe un párrafo continuo, motivador y fluido. Destaca la confianza del alumno, su ritmo al hablar o cómo abordó el tema específico solicitado en la tarea. Cita textualmente entre comillas frases o palabras exactas que haya pronunciado o estructurado bien para demostrarle que analizaste su audio con detalle, usando fórmulas como "Demuestras una gran confianza al..." o "Logras identificar con mucha precisión...").

---

### 🛠️ Área de mejora
(Escribe un párrafo cercano y constructivo enfocado en un máximo de 2 vicios de pronunciación o de gramática notables que se deduzcan de la transcripción de su audio respecto a lo que pedía la tarea. No listes reglas genéricas; menciona el error específico que cometió y contrástalo inmediatamente con cómo debe sonar o estructurarse correctamente usando ejemplos entre comillas. Termina el párrafo con una frase amigable y un consejo práctico que lo motive a seguir practicando para su seguridad).`;

        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3
            })
        });

        if (!gptResponse.ok) {
            const errorData = await gptResponse.json();
            throw new Error(errorData.error?.message || "Error en la evaluación de la IA.");
        }

        const gptData = await gptResponse.json();
        const rawMarkDown = gptData.choices[0].message.content;
        
        evaluationOutput.innerHTML = rawMarkDown.replace(/\n/g, '<br>');
        resultBox.classList.remove('hidden');
        statusText.innerText = "Estado: ¡Evaluación completa con éxito!";

    } catch (error) {
        alert("Hubo un problema: " + error.message);
        statusText.innerText = "Estado: Error en el proceso.";
        console.error(error);
    } finally {
        btnEvaluate.disabled = false;
    }
});
