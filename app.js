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

// --- 1. GUARDADO AUTOMÁTICO DE LA API KEY (LOCALSTORAGE) ---
document.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
        statusText.innerText = "Estado: API Key cargada automáticamente.";
    }
});

apiKeyInput.addEventListener('input', () => {
    localStorage.setItem('openai_api_key', apiKeyInput.value.trim());
});


// --- 2. LÓGICA DE GRABACIÓN DE AUDIO ---
btnStart.addEventListener('click', async () => {
    audioChunks = [];
    fileInput.value = ""; // Limpiar archivo subido si decide grabar nuevo audio
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
        alert("No se pudo acceder al micrófono. Verifica los permisos de tu navegador.");
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
        audioBlob = file; // Guardamos el archivo subido directamente
        const audioUrl = URL.createObjectURL(file);
        audioPlayback.src = audioUrl; // Permite reproducir el archivo cargado en la web
        btnEvaluate.disabled = false;
        statusText.innerText = `Estado: Archivo "${file.name}" cargado y listo para evaluar.`;
    }
});


// --- 4. CONEXIÓN CON LAS APIs DE OPENAI (WHISPER + GPT-4o) ---
btnEvaluate.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        alert("Por favor, ingresa tu OpenAI API Key en el cuadro de texto primero.");
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
        
        // Detectar si el audio viene de un archivo subido o de la grabadora directa
        if (fileInput.files.length > 0) {
            const uploadedFile = fileInput.files[0];
            const extension = uploadedFile.name.split('.').pop(); // Extrae la extensión (.mp3, .m4a, etc.)
            formData.append('file', audioBlob, `student_audio.${extension}`);
        } else {
            formData.append('file', audioBlob, 'recording.webm');
        }
        
        formData.append('model', 'whisper-1');

        // PASO A: Llamada a la API de Whisper
        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!whisperResponse.ok) {
            const errorData = await whisperResponse.json();
            throw new Error(errorData.error?.message || "Error en la transcripción del archivo de audio.");
        }
        
        const whisperData = await whisperResponse.json();
        const studentText = whisperData.text;

        statusText.innerText = "Analizando texto con GPT-4o según criterios MCER A2...";

        // PASO B: Llamada a la API de GPT-4o
        const prompt = `Actúa como un examinador oficial de idiomas experto en el Marco Común Europeo de Referencia (MCER).
Evalúa de manera estricta pero constructiva si la siguiente transcripción de un estudiante cumple con los requisitos mínimos del nivel A2 para la tarea: "Describir la rutina diaria".

Texto del estudiante: "${studentText}"

Entrega tu evaluación en formato estructurado usando Markdown claro:
1. **Transcripción detectada**: Muestra exactamente lo que el alumno dijo.
2. **Gramática y Vocabulario (Nivel A2)**: Analiza si usa presente simple, verbos de rutina y conectores básicos (and, but, because). Detecta errores clave de forma educativa.
3. **Veredicto de Nivel A2**: [CUMPLE TOTALMENTE / CUMPLE PARCIALMENTE / NO CUMPLE]
4. **Retroalimentación para el alumno**: Consejos amigables y sugerencias específicas para mejorar.`;

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
        
        // Renderizar saltos de línea para la vista en pantalla
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
