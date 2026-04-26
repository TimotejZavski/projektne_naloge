import React, { useEffect, useState } from 'react';

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/hello')
      .then(res => res.json())
      .then(data => setMessage(JSON.stringify(data)))
      .catch(() => setMessage('Backend not reachable'));
  }, []);

  return <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
    <h1>Hello World  MERN Stack</h1>
    <p>Connected to MongoDB (empty DB "rai")</p>
    <p>GET /api/hello response: {message}</p>
  </div>;
}

export default App;