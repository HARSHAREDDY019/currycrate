// api.js
const BASE_URL = 'http://localhost:3000'; // Your backend server

export async function placeOrder(orderData) {
  const response = await fetch(`${BASE_URL}/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderData),
  });
  return response.json();
}
