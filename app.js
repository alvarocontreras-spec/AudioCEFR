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
    
    // Cargar la última tarea escrita por el profesor
    const savedTask = localStorage.getItem('last_task_instructions');
    if (savedTask) {
        taskInstructionsInput.value = savedTask;
        statusText.innerText = "Estado: API Key y tarea anterior cargadas de forma local.";
    } else {
        // Dejar completamente vacío para forzar al profesor a ingresar la tarea real
        taskInstructionsInput.value = '';
        statusText.innerText = "Estado: Listo. Por favor, escribe las instrucciones de la tarea.";
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
    if (!taskInstructions) {
        alert("Por favor, escribe primero las instrucciones de la tarea que vas a evaluar en el cuadro de texto.");
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

        statusText.innerText = "Analizando texto con GPT-4o según tus criterios...";

        // PROMPT ULTRA SINTÉTICO (CORTANTE)
        const prompt = `Eres un profesor de inglés experto para nivel A2. Evalúa la respuesta oral basándote en la transcripción.

## Contexto
- Tarea asignada: "${taskInstructions}"
- Transcripción del audio: "${studentText}"

## REGLA DE ORO OBLIGATORIA
- Sé extremadamente breve. Cada sección DEBE tener entre 15 y 20 palabras como máximo. No uses saludos ni despedidas motivacionales largas. Ve directo al grano en una sola línea.

Entrega tu evaluación utilizando ESTRICTAMENTE la siguiente estructura en Markdown:

### 📊 Resultado General
* **Transcripción detectada**: "${studentText}"
* **Veredicto de Nivel A2**: [CUMPLE TOTALMENTE / CUMPLE PARCIALMENTE / NO CUMPLE]

---

### 💪 Lo que haces bien (Strengths)
(En una sola frase de máximo 20 palabras, di qué logró el alumno con su vocabulario o fluidez).

---

### 🛠️ Lo que puedes mejorar (Areas for Improvement)
(En una sola frase de máximo 20 palabras, muestra el error crítico corregido entre comillas y un micro-consejo).`;

        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2, // Baja temperatura para seguir reglas estrictas y evitar textos creativos
                max_tokens: 150   // Candado técnico que limita físicamente el tamaño máximo de la respuesta
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
