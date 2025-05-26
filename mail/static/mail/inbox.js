document.addEventListener('DOMContentLoaded', function() {
  // Button event listeners
  document.querySelector('#inbox').addEventListener('click', () => load_mailbox('inbox'));
  document.querySelector('#sent').addEventListener('click', () => load_mailbox('sent'));
  document.querySelector('#archived').addEventListener('click', () => load_mailbox('archive'));
  document.querySelector('#compose').addEventListener('click', compose_email);

  // Start with the inbox
  load_mailbox('inbox');
});

function compose_email() {
  // Show compose view and hide others
  document.querySelector('#emails-view').style.display = 'none';
  document.querySelector('#compose-view').style.display = 'block';
  document.querySelector('#email-detail-view').style.display = 'none';

  // Clear form fields
  document.querySelector('#compose-recipients').value = '';
  document.querySelector('#compose-subject').value = '';
  document.querySelector('#compose-body').value = '';

  // Form submission handler
  document.querySelector('#compose-form').onsubmit = function(event) {
      event.preventDefault();
      
      // Send email via API
      fetch('/emails', {
          method: 'POST',
          body: JSON.stringify({
              recipients: document.querySelector('#compose-recipients').value,
              subject: document.querySelector('#compose-subject').value,
              body: document.querySelector('#compose-body').value
          })
      })
      .then(response => {
          if (!response.ok) {
              return response.json().then(error => Promise.reject(error));
          }
          return response.json();
      })
      .then(result => {
          // Load sent mailbox after successful send
          load_mailbox('sent');
      })
      .catch(error => {
          console.error('Error:', error);
          alert(error.error || 'Failed to send email');
      });
  };
}

function load_mailbox(mailbox) {
  // Show mailbox and hide others
  document.querySelector('#emails-view').style.display = 'block';
  document.querySelector('#compose-view').style.display = 'none';
  document.querySelector('#email-detail-view').style.display = 'none';

  // Show mailbox name
  document.querySelector('#emails-view').innerHTML = `<h3>${mailbox.charAt(0).toUpperCase() + mailbox.slice(1)}</h3>`;

  // Get emails for this mailbox
  fetch(`/emails/${mailbox}`)
  .then(response => response.json())
  .then(emails => {
      const emailsContainer = document.createElement('div');
      emailsContainer.className = 'emails-container';
      
      if (emails.length === 0) {
          emailsContainer.innerHTML = '<p>No emails in this mailbox.</p>';
      } else {
          emails.forEach(email => {
              const emailDiv = document.createElement('div');
              emailDiv.className = `email ${email.read ? 'read' : 'unread'}`;
              
              // Different display for sent vs received emails
              if (mailbox === 'sent') {
                  emailDiv.innerHTML = `
                      <div class="email-recipients">To: ${email.recipients.join(', ')}</div>
                      <div class="email-subject">${email.subject}</div>
                      <div class="email-timestamp">${email.timestamp}</div>
                  `;
              } else {
                  emailDiv.innerHTML = `
                      <div class="email-sender">From: ${email.sender}</div>
                      <div class="email-subject">${email.subject}</div>
                      <div class="email-timestamp">${email.timestamp}</div>
                  `;
              }
              
              emailDiv.addEventListener('click', () => view_email(email.id, mailbox));
              emailsContainer.appendChild(emailDiv);
          });
      }
      
      document.querySelector('#emails-view').append(emailsContainer);
  });
}

function view_email(email_id, mailbox) {
  // Show email view and hide others
  document.querySelector('#emails-view').style.display = 'none';
  document.querySelector('#compose-view').style.display = 'none';
  document.querySelector('#email-detail-view').style.display = 'block';
  
  // Clear previous email
  const emailView = document.querySelector('#email-detail-view');
  emailView.innerHTML = '';
  
  // Get the email
  fetch(`/emails/${email_id}`)
  .then(response => response.json())
  .then(email => {
      // Mark as read if not already
      if (!email.read) {
          fetch(`/emails/${email_id}`, {
              method: 'PUT',
              body: JSON.stringify({
                  read: true
              })
          });
      }
      
      // Display email
      emailView.innerHTML = `
          <div class="email-header">
              <p><strong>From:</strong> ${email.sender}</p>
              <p><strong>To:</strong> ${email.recipients.join(', ')}</p>
              <p><strong>Subject:</strong> ${email.subject}</p>
              <p><strong>Timestamp:</strong> ${email.timestamp}</p>
              <div class="email-actions">
                  <button class="btn btn-sm btn-outline-primary" id="reply">Reply</button>
                  ${mailbox === 'inbox' ? 
                      `<button class="btn btn-sm btn-outline-primary" id="archive">Archive</button>` : 
                      mailbox === 'archive' ? 
                      `<button class="btn btn-sm btn-outline-primary" id="unarchive">Unarchive</button>` : ''}
              </div>
          </div>
          <div class="email-body">
              ${email.body.replace(/\n/g, '<br>')}
          </div>
      `;
      
      // Add reply handler
      document.querySelector('#reply').addEventListener('click', () => reply_email(email));
      
      // Add archive/unarchive handler
      const archiveBtn = document.querySelector('#archive');
      const unarchiveBtn = document.querySelector('#unarchive');
      
      if (archiveBtn) {
          archiveBtn.addEventListener('click', () => {
              fetch(`/emails/${email_id}`, {
                  method: 'PUT',
                  body: JSON.stringify({
                      archived: true
                  })
              })
              .then(() => load_mailbox('inbox'));
          });
      }
      
      if (unarchiveBtn) {
          unarchiveBtn.addEventListener('click', () => {
              fetch(`/emails/${email_id}`, {
                  method: 'PUT',
                  body: JSON.stringify({
                      archived: false
                  })
              })
              .then(() => load_mailbox('inbox'));
          });
      }
  });
}

function reply_email(email) {
  // Show compose view
  compose_email();
  
  // Pre-fill form
  document.querySelector('#compose-recipients').value = email.sender;
  
  // Add Re: if not already in subject
  const subject = email.subject.startsWith('Re: ') ? email.subject : `Re: ${email.subject}`;
  document.querySelector('#compose-subject').value = subject;
  
  // Pre-fill body with original message
  document.querySelector('#compose-body').value = `On ${email.timestamp} ${email.sender} wrote:\n${email.body}\n\n`;
}