// --- GUARDADO AUTOMÁTICO DE API KEY ---
const apiKeyInput = document.getElementById('apiKey');

// Al cargar la página, verificar si ya hay una clave guardada en la computadora
document.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
        apiKeyInput.value = savedKey;
        statusText.innerText = "Estado: API Key cargada automáticamente.";
    }
});

// Escuchar cuando escribas o pegues la clave para guardarla al instante
apiKeyInput.addEventListener('input', () => {
    localStorage.setItem('openai_api_key', apiKeyInput.value.trim());
});
// --------------------------------------
