
fetch('http://localhost:3001/api/books/process-metadata', { method: 'POST' })
  .then(res => {
      console.log('Status:', res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      return reader.read().then(function processText({ done, value }) {
        if (done) return;
        console.log(decoder.decode(value));
        return reader.read().then(processText);
      });
  })
  .catch(err => console.error(err));
