import React, { useState } from 'react';
import { loginUser } from './api';

const Login = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async e => {
    e.preventDefault();
    setMessage('');
    try {
      const data = await loginUser(username, password);
      localStorage.setItem('token', data.token);
      setMessage('Login successful!');
      onLoginSuccess(); // notify parent component
    } catch (error) {
      setMessage(error.response?.data?.message || 'Login failed');
      console.error('Error logging in:', error);
    }
  };

  return (
    <div>
      <h2>Login</h2>
      <form onSubmit={handleLogin}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
        /><br/>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        /><br/>
        <button type="submit">Login</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
};

export default Login;
