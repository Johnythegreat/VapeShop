
const promos = [
  {
    title: "Hot Vape Deal",
    desc: "V2 + V3 Bundle",
    price: "₱750",
    image: "https://via.placeholder.com/300"
  }
];

function loadPromos(){
  const container = document.getElementById("promoContainer");
  container.innerHTML = "";

  promos.forEach(p => {
    const div = document.createElement("div");
    div.className = "promo-card";

    div.innerHTML = `
      <img src="${p.image}">
      <h3>${p.title}</h3>
      <p>${p.desc}</p>
      <strong>${p.price}</strong>
    `;

    container.appendChild(div);
  });
}

loadPromos();
