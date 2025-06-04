import React, { useEffect, useState } from 'react';
import { getProfile } from './api';

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('No token found. Please log in.');
        return;
      }
      try {
        const data = await getProfile(token);
        setProfile(data);
      } catch (err) {
        setError('Failed to load profile or orders.');
        console.error('Error fetching profile:', err);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  if (error) return <p>{error}</p>;
  if (!profile) return <p>Loading profile...</p>;

  return (
    <div>
      <h2>Profile</h2>
      <p><strong>Username:</strong> {profile.username}</p>
      {profile.email && <p><strong>Email:</strong> {profile.email}</p>}

      <button onClick={handleLogout}>Logout</button>

      {profile.orders && profile.orders.length > 0 ? (
        <div>
          <h3 style={{ marginTop: '2rem' }}>Order History</h3>
          {profile.orders.map((order, idx) => (
            <div key={idx} style={{ border: '1px solid #ccc', marginBottom: '1rem', padding: '1rem', borderRadius: '6px' }}>
              <p><strong>Order ID:</strong> {order.orderId || 'N/A'}</p>
              <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleString()}</p>
              <p><strong>Total:</strong> ${order.total}</p>
              <p><strong>Items:</strong></p>
              <ul>
                {order.items.map((item, i) => (
                  <li key={i}>
                    {item.name} × {item.quantity} — {item.price}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p>No previous orders found.</p>
      )}
    </div>
  );
};

export default Profile;
