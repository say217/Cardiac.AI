const predictButton = document.getElementById('predict-btn');
const clickSound = document.getElementById('clickSound');
const predictionForm = document.getElementById('prediction-form');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('send-chat-btn');
const promptChips = document.querySelectorAll('.prompt-chip');

function scrollChatToBottom() {
  if (chatBox) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

function updateWatermarkVisibility() {
  if (!chatBox) return;
  if (chatBox.querySelectorAll('.message').length > 0) {
    chatBox.classList.add('has-messages');
  }
}

function buildChatLoader() {
  return '<div class="ai-response"><div class="loader" aria-hidden="true"><div class="bar1"></div><div class="bar2"></div><div class="bar3"></div><div class="bar4"></div><div class="bar5"></div><div class="bar6"></div><div class="bar7"></div><div class="bar8"></div><div class="bar9"></div><div class="bar10"></div><div class="bar11"></div><div class="bar12"></div></div></div>';
}

if (predictButton && clickSound) {
  predictButton.addEventListener('click', () => {
    try {
      clickSound.currentTime = 0;
      clickSound.play();
    } catch (error) {
      console.error(error);
    }
  });
}

if (predictionForm && predictButton) {
  predictionForm.addEventListener('submit', async event => {
    event.preventDefault();

    const buttonText = predictButton.querySelector('.btn-text');
    const loader = predictButton.querySelector('.form-loader');
    const submitUrl = predictionForm.action || window.location.pathname;

    predictButton.disabled = true;
    buttonText.style.display = 'none';
    loader.style.display = 'inline-block';

    try {
      const response = await fetch(submitUrl, {
        method: 'POST',
        body: new FormData(predictionForm),
      });

      if (!response.ok) {
        throw new Error(`Server error ${response.status}`);
      }

      window.location.reload();
    } catch (error) {
      console.error('Prediction failed:', error);
      alert('Prediction failed. Please try again.');
      predictButton.disabled = false;
      buttonText.style.display = 'inline';
      loader.style.display = 'none';
    }
  });
}

async function sendMessage() {
  if (!chatInput || !chatBox) return;

  const message = chatInput.value.trim();
  if (!message) return;

  const userMessage = document.createElement('div');
  userMessage.className = 'message user-msg';
  userMessage.innerHTML = `<div class="user-content">${message.replace(/\n/g, '<br>')}</div>`;
  chatBox.appendChild(userMessage);
  scrollChatToBottom();

  const loaderMessage = document.createElement('div');
  loaderMessage.className = 'message ai-msg';
  loaderMessage.innerHTML = buildChatLoader();
  chatBox.appendChild(loaderMessage);
  scrollChatToBottom();

  chatInput.value = '';
  updateWatermarkVisibility();

  const chatUrl = chatBox.dataset.chatUrl || '/chat';

  try {
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const data = await response.json();

    if (data.error) {
      loaderMessage.innerHTML = `<div class="ai-response"><strong>Error:</strong> ${data.error}</div>`;
    } else {
      loaderMessage.innerHTML = `<div class="ai-response">${data.ai_message}</div>`;
    }

    scrollChatToBottom();
    updateWatermarkVisibility();
  } catch (error) {
    console.error(error);
    loaderMessage.innerHTML = '<div class="ai-response">Connection error - please try again</div>';
    scrollChatToBottom();
  }
}

if (chatInput && chatBox) {
  chatInput.addEventListener('input', () => {
    scrollChatToBottom();
  });

  chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

if (sendButton) {
  sendButton.addEventListener('click', sendMessage);
}

promptChips.forEach(chip => {
  chip.addEventListener('click', () => {
    if (!chatInput) return;
    chatInput.value = chip.textContent;
    chatInput.focus();
  });
});

updateWatermarkVisibility();
