export const config = {
  webhookUrl:'http://localhost:3002/webhooks/whapi',
  // webhookUrl:"https://zxd414ww-80.uks1.devtunnels.ms/whatsapp-clone/public/api2.php",
  // webhookUrl:"http://192.168.1.89/whatsapp-clone/public/api2.php",
  // webhookUrl: "http://192.168.1.71:3002/webhooks/whapi",
  conversationsCount:1, // nombre de chats
  messagesPerconversation: 2, // message par chat
  parallelRequests:1, //rafale
};