// 'use client'
// import React, { useState, useEffect, useRef } from 'react';
// import { Send, User, Clock, Check, CheckCheck, Phone, Search, LogOut, Wifi, WifiOff } from 'lucide-react';

// const WhatsAppInterface = () => {
//   const [commercial, setCommercial] = useState(null);
//   const [conversations, setConversations] = useState([]);
//   const [selectedConv, setSelectedConv] = useState(null);
//   const [messages, setMessages] = useState([]);
//   const [newMessage, setNewMessage] = useState('');
//   const [wsConnected, setWsConnected] = useState(false);
//   const [searchTerm, setSearchTerm] = useState('');
//   const [loginForm, setLoginForm] = useState({ email: '', password: '' });
//   const wsRef = useRef(null);
//   const messagesEndRef = useRef(null);

//   // Connexion WebSocket
//   useEffect(() => {
//     if (commercial) {
//       connectWebSocket();
//     }
//     return () => {
//       if (wsRef.current) {
//         wsRef.current.close();
//       }
//     };
//   }, [commercial]);

//   const connectWebSocket = () => {
//     const ws = new WebSocket('wss://votre-serveur.com/ws');
    
//     ws.onopen = () => {
//       setWsConnected(true);
//       // Authentification du commercial
//       ws.send(JSON.stringify({
//         type: 'auth',
//         commercialId: commercial.id,
//         token: commercial.token
//       }));
//     };

//     ws.onmessage = (event) => {
//       const data = JSON.parse(event.data);
//       handleWebSocketMessage(data);
//     };

//     ws.onerror = (error) => {
//       console.error('WebSocket error:', error);
//       setWsConnected(false);
//     };

//     ws.onclose = () => {
//       setWsConnected(false);
//       // Tentative de reconnexion après 3 secondes
//       setTimeout(() => {
//         if (commercial) connectWebSocket();
//       }, 3000);
//     };

//     wsRef.current = ws;
//   };

//   const handleWebSocketMessage = (data) => {
//     switch (data.type) {
//       case 'new_conversation':
//         // Nouvelle conversation attribuée
//         setConversations(prev => [data.conversation, ...prev]);
//         break;
      
//       case 'new_message':
//         // Nouveau message dans une conversation
//         if (selectedConv && data.conversationId === selectedConv.id) {
//           setMessages(prev => [...prev, data.message]);
//         }
//         // Mettre à jour le dernier message dans la liste
//         setConversations(prev => prev.map(conv => 
//           conv.id === data.conversationId 
//             ? { ...conv, lastMessage: data.message, unreadCount: conv.id === selectedConv?.id ? 0 : (conv.unreadCount || 0) + 1 }
//             : conv
//         ));
//         break;
      
//       case 'message_status':
//         // Mise à jour du statut du message (envoyé, livré, lu)
//         setMessages(prev => prev.map(msg => 
//           msg.id === data.messageId 
//             ? { ...msg, status: data.status }
//             : msg
//         ));
//         break;
      
//       case 'conversation_reassigned':
//         // Conversation réattribuée à un autre commercial
//         setConversations(prev => prev.filter(conv => conv.id !== data.conversationId));
//         if (selectedConv?.id === data.conversationId) {
//           setSelectedConv(null);
//           setMessages([]);
//         }
//         break;
//     }
//   };

//   const handleLogin = () => {
//     // Simulation de connexion (à remplacer par un vrai appel API)
//     if (!loginForm.email || !loginForm.password) return;
    
//     const mockCommercial = {
//       id: 'comm_' + Date.now(),
//       name: 'Commercial Demo',
//       email: loginForm.email,
//       token: 'mock_token_' + Date.now()
//     };
//     setCommercial(mockCommercial);
    
//     // Charger les conversations (simulation)
//     loadConversations(mockCommercial.id);
//   };

//   const loadConversations = (commercialId) => {
//     // Simulation de chargement des conversations
//     const mockConversations = [
//       {
//         id: 'conv_1',
//         clientName: 'Ahmed Benali',
//         clientPhone: '+212612345678',
//         lastMessage: { text: 'Bonjour, je souhaite des informations', timestamp: new Date(Date.now() - 300000), from: 'client' },
//         unreadCount: 2,
//         status: 'active'
//       },
//       {
//         id: 'conv_2',
//         clientName: 'Fatima Zahra',
//         clientPhone: '+212623456789',
//         lastMessage: { text: 'Merci pour votre réponse', timestamp: new Date(Date.now() - 600000), from: 'commercial' },
//         unreadCount: 0,
//         status: 'active'
//       },
//       {
//         id: 'conv_3',
//         clientName: 'Youssef Alami',
//         clientPhone: '+212634567890',
//         lastMessage: { text: 'Quel est le prix?', timestamp: new Date(Date.now() - 900000), from: 'client' },
//         unreadCount: 1,
//         status: 'active'
//       }
//     ];
//     setConversations(mockConversations);
//   };

//   const selectConversation = (conv) => {
//     setSelectedConv(conv);
//     // Réinitialiser le compteur non lus
//     setConversations(prev => prev.map(c => 
//       c.id === conv.id ? { ...c, unreadCount: 0 } : c
//     ));
    
//     // Charger les messages de la conversation
//     loadMessages(conv.id);
//   };

//   const loadMessages = (conversationId) => {
//     // Simulation de chargement des messages
//     const mockMessages = [
//       {
//         id: 'msg_1',
//         text: 'Bonjour, je souhaite des informations sur vos produits',
//         timestamp: new Date(Date.now() - 600000),
//         from: 'client',
//         status: 'read'
//       },
//       {
//         id: 'msg_2',
//         text: 'Bonjour! Je serais ravi de vous aider. Quel type de produit vous intéresse?',
//         timestamp: new Date(Date.now() - 500000),
//         from: 'commercial',
//         status: 'read'
//       },
//       {
//         id: 'msg_3',
//         text: 'Je cherche des informations sur vos services',
//         timestamp: new Date(Date.now() - 300000),
//         from: 'client',
//         status: 'read'
//       }
//     ];
//     setMessages(mockMessages);
//   };

//   const sendMessage = () => {
//     if (!newMessage.trim() || !selectedConv || !wsConnected) return;

//     const message = {
//       type: 'send_message',
//       conversationId: selectedConv.id,
//       clientPhone: selectedConv.clientPhone,
//       text: newMessage.trim(),
//       commercialId: commercial.id,
//       timestamp: new Date()
//     };

//     // Envoyer via WebSocket
//     wsRef.current.send(JSON.stringify(message));

//     // Ajouter le message localement (optimistic update)
//     const newMsg = {
//       id: 'msg_temp_' + Date.now(),
//       text: newMessage.trim(),
//       timestamp: new Date(),
//       from: 'commercial',
//       status: 'sending'
//     };
    
//     setMessages(prev => [...prev, newMsg]);
//     setNewMessage('');
//   };

//   const handleLogout = () => {
//     if (wsRef.current) {
//       wsRef.current.close();
//     }
//     setCommercial(null);
//     setConversations([]);
//     setSelectedConv(null);
//     setMessages([]);
//   };

//   const formatTime = (date) => {
//     const now = new Date();
//     const diff = now - date;
    
//     if (diff < 86400000) { // Moins de 24h
//       return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
//     } else if (diff < 604800000) { // Moins d'une semaine
//       return date.toLocaleDateString('fr-FR', { weekday: 'short' });
//     } else {
//       return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
//     }
//   };

//   const filteredConversations = conversations.filter(conv =>
//     conv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//     conv.clientPhone.includes(searchTerm)
//   );

//   // Scroll automatique vers le bas des messages
//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages]);

//   // Page de connexion
//   if (!commercial) {
//     return (
//       <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-green-100">
//                   <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
//           <div className="text-center mb-8">
//             <div className="inline-block p-3 bg-green-100 rounded-full mb-4">
//               <Phone className="w-8 h-8 text-green-600" />
//             </div>
//             <h1 className="text-3xl font-bold text-gray-800 mb-2">WhatsApp Commercial</h1>
//             <p className="text-gray-600">Connectez-vous pour gérer vos conversations</p>
//           </div>
          
//           <div className="space-y-4">
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
//               <input
//                 type="email"
//                 value={loginForm.email}
//                 onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
//                 onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
//                 className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
//                 placeholder="votre@email.com"
//               />
//             </div>
            
//             <div>
//               <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
//               <input
//                 type="password"
//                 value={loginForm.password}
//                 onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
//                 onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
//                 className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
//                 placeholder="••••••••"
//               />
//             </div>
            
//             <button
//               onClick={handleLogin}
//               className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
//             >
//               Se connecter
//             </button>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   // Interface principale
//   return (
//     <div className="flex h-screen bg-gray-100">
//       {/* Sidebar - Liste des conversations */}
//       <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
//         {/* Header */}
//         <div className="bg-green-600 text-white p-4">
//           <div className="flex items-center justify-between mb-4">
//             <div className="flex items-center gap-3">
//               <div className="w-10 h-10 bg-green-700 rounded-full flex items-center justify-center">
//                 <User className="w-6 h-6" />
//               </div>
//               <div>
//                 <h2 className="font-semibold">{commercial.name}</h2>
//                 <div className="flex items-center gap-1 text-xs">
//                   {wsConnected ? (
//                     <>
//                       <Wifi className="w-3 h-3" />
//                       <span>Connecté</span>
//                     </>
//                   ) : (
//                     <>
//                       <WifiOff className="w-3 h-3" />
//                       <span>Déconnecté</span>
//                     </>
//                   )}
//                 </div>
//               </div>
//             </div>
//             <button
//               onClick={handleLogout}
//               className="p-2 hover:bg-green-700 rounded-full transition-colors"
//               title="Déconnexion"
//             >
//               <LogOut className="w-5 h-5" />
//             </button>
//           </div>
          
//           {/* Barre de recherche */}
//           <div className="relative">
//             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-green-200" />
//             <input
//               type="text"
//               value={searchTerm}
//               onChange={(e) => setSearchTerm(e.target.value)}
//               placeholder="Rechercher une conversation..."
//               className="w-full pl-10 pr-4 py-2 bg-green-700 text-white placeholder-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
//             />
//           </div>
//         </div>

//         {/* Liste des conversations */}
//         <div className="flex-1 overflow-y-auto">
//           {filteredConversations.length === 0 ? (
//             <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
//               <User className="w-16 h-16 mb-2" />
//               <p className="text-center">Aucune conversation</p>
//             </div>
//           ) : (
//             filteredConversations.map((conv) => (
//               <div
//                 key={conv.id}
//                 onClick={() => selectConversation(conv)}
//                 className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
//                   selectedConv?.id === conv.id ? 'bg-green-50' : ''
//                 }`}
//               >
//                 <div className="flex items-start gap-3">
//                   <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
//                     <User className="w-6 h-6 text-green-600" />
//                   </div>
//                   <div className="flex-1 min-w-0">
//                     <div className="flex items-center justify-between mb-1">
//                       <h3 className="font-semibold text-gray-800 truncate">{conv.clientName}</h3>
//                       <span className="text-xs text-gray-500">{formatTime(conv.lastMessage.timestamp)}</span>
//                     </div>
//                     <p className="text-sm text-gray-600 truncate">{conv.clientPhone}</p>
//                     <p className="text-sm text-gray-500 truncate mt-1">{conv.lastMessage.text}</p>
//                   </div>
//                   {conv.unreadCount > 0 && (
//                     <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
//                       {conv.unreadCount}
//                     </div>
//                   )}
//                 </div>
//               </div>
//             ))
//           )}
//         </div>
//       </div>

//       {/* Zone de conversation */}
//       <div className="flex-1 flex flex-col">
//         {selectedConv ? (
//           <>
//             {/* Header de la conversation */}
//             <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-3">
//               <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
//                 <User className="w-6 h-6 text-green-600" />
//               </div>
//               <div>
//                 <h3 className="font-semibold text-gray-800">{selectedConv.clientName}</h3>
//                 <p className="text-sm text-gray-600">{selectedConv.clientPhone}</p>
//               </div>
//             </div>

//             {/* Messages */}
//             <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
//               {messages.map((msg) => (
//                 <div
//                   key={msg.id}
//                   className={`flex ${msg.from === 'commercial' ? 'justify-end' : 'justify-start'}`}
//                 >
//                   <div
//                     className={`max-w-xl px-4 py-2 rounded-2xl ${
//                       msg.from === 'commercial'
//                         ? 'bg-green-600 text-white'
//                         : 'bg-white text-gray-800'
//                     }`}
//                   >
//                     <p className="whitespace-pre-wrap break-words">{msg.text}</p>
//                     <div className={`flex items-center gap-1 mt-1 text-xs ${
//                       msg.from === 'commercial' ? 'text-green-100' : 'text-gray-500'
//                     }`}>
//                       <span>{formatTime(msg.timestamp)}</span>
//                       {msg.from === 'commercial' && (
//                         <>
//                           {msg.status === 'sending' && <Clock className="w-3 h-3" />}
//                           {msg.status === 'sent' && <Check className="w-3 h-3" />}
//                           {msg.status === 'delivered' && <CheckCheck className="w-3 h-3" />}
//                           {msg.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-300" />}
//                         </>
//                       )}
//                     </div>
//                   </div>
//                 </div>
//               ))}
//               <div ref={messagesEndRef} />
//             </div>

//             {/* Zone d'envoi de message */}
//             <div className="bg-white border-t border-gray-200 p-4">
//               <div className="flex items-end gap-2">
//                 <textarea
//                   value={newMessage}
//                   onChange={(e) => setNewMessage(e.target.value)}
//                   onKeyDown={(e) => {
//                     if (e.key === 'Enter' && !e.shiftKey) {
//                       e.preventDefault();
//                       sendMessage();
//                     }
//                   }}
//                   placeholder="Tapez votre message..."
//                   className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
//                   rows={2}
//                   disabled={!wsConnected}
//                 />
//                 <button
//                   onClick={sendMessage}
//                   disabled={!newMessage.trim() || !wsConnected}
//                   className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
//                 >
//                   <Send className="w-5 h-5" />
//                 </button>
//               </div>
//               {!wsConnected && (
//                 <p className="text-xs text-red-500 mt-2">Connexion perdue. Tentative de reconnexion...</p>
//               )}
//             </div>
//           </>
//         ) : (
//           <div className="flex-1 flex items-center justify-center text-gray-400">
//             <div className="text-center">
//               <Phone className="w-20 h-20 mx-auto mb-4 opacity-50" />
//               <p className="text-xl font-semibold">Sélectionnez une conversation</p>
//               <p className="text-sm mt-2">Choisissez une conversation dans la liste pour commencer</p>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default WhatsAppInterface;