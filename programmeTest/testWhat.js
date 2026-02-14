console.log("salut le monde");

const headers = {
  Authorization: `Bearer EAAW6fPlo8HABQnu5rOSdXUsl2RX3D4T2NqNDN6GaZCVmxuqH3EhEw25jZBFqnWc6j2ES1sqUwzruLtMEXa0MIYOjcRUwj9CkloRogTGJFiimQJavtTZCunZBLJvduQxmOlYiAZBbAONW3km0pRpj3fLhE4l4shMG7VCOL8lkImvbnUWCap83BqUanZAJiRr2jwV4qsTK29o3BLVrdNKzsUThm9UmZCJJaUZBx0KFOxaMpDjEcuv7DL1rkYimm6ph2h2wvhoiyNLo1kLjRZBmSZB8GZBVUZA7jHp42evlNdkkgXoZD`,
  "Content-Type": "application/json",
};
const url = `https://graph.facebook.com/v24.0/963243980212217/messages`;

const body = {
  messaging_product: "whatsapp",
  to: "0556056396",
  type: "text",
  template: {
    name: "hello_world",
    language: { code: "en_US" },
  },
};
const response = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
const data = await response.json();
console.log(data);
