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

// 1. Lógica de grabación de audio
btnStart.addEventListener('click', async () => {
    audioChunks = [];
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPlayback.src = audioUrl;
            btnEvaluate.disabled = false;
            statusText.innerText = "Estado: Grabación pausada y lista para evaluar.";
        };

        mediaRecorder.start();
        btnStart.disabled = true;
        btnStop.disabled = false;
        statusText.innerText = "Estado: Grabando... Habla ahora.";
    } catch (err) {
        alert("No se pudo acceder al micrófono. Verifica los permisos.");
        console.error(err);
    }
});

btnStop.addEventListener('click', () => {
    mediaRecorder.stop();
    // Apagar el micrófono para privacidad
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    btnStart.disabled = false;
    btnStop.disabled = true;
});

// 2. Enviar datos a OpenAI
btnEvaluate.addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
        alert("Por favor, ingresa tu OpenAI API Key.");
        return;
    }

    statusText.innerText = "Procesando... Transcribiendo audio con Whisper...";
    btnEvaluate.disabled = true;

    try {
        // PASO A: Transcripción con Whisper
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.mp3');
        formData.append('model', 'whisper-1');

        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: formData
        });

        if (!whisperResponse.ok) throw new Error("Error en Whisper (Transcripción)");
        const whisperData = await whisperResponse.json();
        const studentText = whisperData.text;

        statusText.innerText = "Analizando texto con GPT según criterios MCER A2...";

        // PASO B: Evaluación del texto con GPT-4o
        const prompt = `Actúa como un examinador oficial de idiomas experto en el Marco Común Europeo de Referencia (MCER).
Evalúa de manera estricta pero constructiva si la siguiente transcripción de un estudiante cumple con los requisitos mínimos del nivel A2 para la tarea: "Describir la rutina diaria".

Texto del estudiante: "${studentText}"

Entrega tu evaluación en formato estructurado usando Markdown claro:
1. **Transcripción detectada**: Muestra lo que dijo.
2. **Gramática y Vocabulario (Nivel A2)**: ¿Usa presente simple, conectores básicos (and, but, because)? Detecta errores clave.
3. **Veredicto de Nivel A2**: [CUMPLE TOTALMENTE / CUMPLE PARCIALMENTE / NO CUMPLE]
4. **Retroalimentación**: Consejos amigables y correcciones para el estudiante.`;

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

        if (!gptResponse.ok) throw new Error("Error en GPT (Evaluación)");
        const gptData = await gptResponse.json();
        
        // Mostrar resultados
        evaluationOutput.innerHTML = gptData.choices[0].message.content.replace(/\n/g, '<br>');
        resultBox.classList.remove('hidden');
        statusText.innerText = "Estado: ¡Evaluación completa!";

    } catch (error) {
        alert("Hubo un error en el proceso: " + error.message);
        statusText.innerText = "Estado: Error en la evaluación.";
    } finally {
        btnEvaluate.disabled = false;
    }
});
