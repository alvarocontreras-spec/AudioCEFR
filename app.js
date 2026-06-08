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
        // Tarea predeterminada en caso de abrir la app por primera vez
        taskInstructionsInput.value = 'Describe tu rutina diaria. ¿A qué hora te levantas, qué haces en la mañana y cómo vas a estudiar o trabajar?';
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
    fileInput.value = ""; // Limpiar archivo cargado si se opta por grabar
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
    if (!taskInstructions) {
        alert("Por favor, escribe las instrucciones de la tarea que vas a evaluar.");
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
        
        // Asignar extensión adecuada para evitar errores de procesamiento en la API
        if (fileInput.files.length > 0) {
            const uploadedFile = fileInput.files[0];
            const extension = uploadedFile.name.split('.').pop(); 
            formData.append('file', audioBlob, `student_audio.${extension}`);
        } else {
            formData.append('file', audioBlob, 'recording.webm');
        }
        
        formData.append('model', 'whisper-1');

        // PASO A: Envío del archivo a Whisper
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

        // PASO B: Envío del texto a GPT-4o con rúbrica estricta del nivel A2
        const prompt = `Actúa como un examinador oficial de idiomas experto en el Marco Común Europeo de Referencia (MCER).
Tu objetivo es evaluar si la transcripción de un audio de un estudiante cumple con las competencias del NIVEL A2 (Usuario Básico).

CONTEXTO DE LA TAREA ASIGNADA AL ESTUDIANTE:
"${taskInstructions}"

TEXTO PRODUCIDO POR EL ESTUDIANTE:
"${studentText}"

CRITERIOS DE EVALUACIÓN OFICIALES NIVEL A2 A CONSIDERAR:
1. Alcance Léxico: ¿Utiliza vocabulario básico y suficiente para abordar el tema específico de la tarea?
2. Corrección Gramatical: ¿Usa estructuras simples de manera sistemática (presente simple, pasado simple, conectores comunes)? Se toleran errores pero no deben bloquear la comunicación.
3. Coherencia y Fluidez: ¿Une frases cortas de forma lineal recurriendo a conectores elementales (and, but, because, then)?

Entrega tu evaluación utilizando estrictamente la siguiente estructura en Markdown:

### 📊 Resultados de la Evaluación

* **Transcripción detectada**: "${studentText}"
* **Veredicto de Nivel A2**: [CUMPLE TOTALMENTE / CUMPLE PARCIALMENTE / NO CUMPLE]

---

### 💪 Fortalezas
(Analiza de forma pedagógica qué logró hacer bien el alumno según los criterios A2 en este audio, enfocándote en el uso de vocabulario, confianza o estructuras apropiadas para la tarea. Destaca palabras o frases exactas que usó correctamente entre comillas).

---

### 🛠️ Área de mejora
(Señala de forma constructiva los errores gramaticales, léxicos o fonéticos deducibles más críticos para el nivel A2. Proporciona ejemplos claros de cómo debió estructurarse o decirse y un consejo breve para practicar en sus futuras tareas).`;

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
        
        // Reemplazar saltos de línea para el renderizado correcto en HTML básico
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
