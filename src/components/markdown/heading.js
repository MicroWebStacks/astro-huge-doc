
function init(){
    const copyIcons = document.querySelectorAll('.icon.copy');
    copyIcons.forEach(icon => {
      icon.addEventListener('click', function() {
        // Copy data-sid to clipboard
        const url = this.getAttribute('data-url');
        if (getComputedStyle(this).position === 'static') {
          this.style.position = 'relative';
        }
        const full_url = `${window.location.origin}/${url}`;
        navigator.clipboard.writeText(full_url).then(() => {
          // Show success message
          const message = document.createElement('span');
          message.textContent = 'Copied!';
          message.style.position = 'absolute';
          message.style.left = '100%';
          message.style.top = '0';
          message.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
          message.style.color = '#fff';
          message.style.borderRadius = '4px';
          message.style.padding = '2px 8px';
          message.style.fontSize = '0.75rem';
          message.style.marginLeft = '10px';
          message.style.pointerEvents = 'none';
          this.appendChild(message);

          // Remove the message after 1 second
          setTimeout(() => {
            this.removeChild(message);
          }, 1000);
        }).catch(err => {
          console.error('Failed to copy text: ', err);
        });
      });
    });
}

document.addEventListener('DOMContentLoaded', init);  

