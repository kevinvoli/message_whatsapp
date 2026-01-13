aide moi a rediget un chaire des charge pour mon projet de dispacher de chat whatsapp base sur whapi websocket nestjs et react pour le front 

pour le back 
techno: nestjs typeOrm avec les validation dto base de donne mysql 

pour le front on pare sur quelque chose de simple tailwindcss on ne veux pas de shacdn pour larchitecture des dossier front respecte celle si

├───app
│   │   favicon.ico
│   │   globals.css
│   │   layout.tsx
│   │   page.tsx
│   │
│   ├───login
│   │       page.tsx
│   │
│   └───whatsapp
│           page.tsx
│
├───components
│   ├───auth
│   │       loginForm.tsx
│   │
│   ├───chat
│   │       ChatHeader.tsx
│   │       ChatInput.tsx
│   │       ChatMessages.tsx
│   │
│   ├───sidebar
│   │       ConversationItem.tsx
│   │       Sidebar.tsx
│   │
│   └───ui
│           button.tsx
│           card.tsx
│           input.tsx
│
├───hooks
│       useAuth.ts
│       useConversations.ts
│       useWebSocket.ts
│
├───lib
│       utils.ts
│
└───types
        chat.ts

fonctionnement et regle

le dispacher doit pouvoir 
- atribue une discution whatsapp a un commercial en fonction de plusieur critère 
    1 pandent une discution un commercial de doit pas se deconnecté si un commercial est deconnecté et que le client envoire un message le dispacher reatribue la conversation (discution ) a un autre commercial 
    tant que le client n'a pas encore envoye un message la discution est toujour a lui
    2 lorsque un client envoie un message pour la premiere fois le dispacher verifier dans une fil d'attente les commerciaul qui sont connecté et donne c'est le tous d'avoire une conversation 

    3 les discution sont attribuer uniquement au commerciaux qui sont dans la fil d'attente

    4 les commerciaux qui ce deconnecte pandant une conversation sont immediatement retire de la fil d'attente et lorsqu'il ce reconnecte il sont relegé a la derniere place de la fil d'attente 

    5 le dispacher atribue les message sous forme de rotation c'est a dire lorsqu'il a fini d'atribue des comversation a tous les commerciaux il revient encore au commercial qui est en tete de liste 

    6 si tous les commerciau sont deconnecté et que des client envoie des message il n'y donc personne dans la fil d'attente donc il stocke les message dans une fil fils d'attente  et attente une sertain heure de la journé cette heure doit pouvoir etre parametre la l'admin ainsi que certeint action pertinante du dispacher et meme si l'heur n'est pas encore arriver l'admin decide de la distribution immediat des conversation au commerciau

- les regle lier au message 
    1 si le commercial a qui une discution a ete attribue ne repond pas a la discution pandent 24h il ne doit plus pouvoir repondre a la discution meme s'il le voulait cette duree de 24h peut etre ajuste pas l'admin

    2 un commercial ne doit pas etre capable de repondre a la comversation

toute les communication et ou transmission de donne du front au back doit blicatoirement passe pas websocket mise a par la la connection de du commercial a sa page de discution

peux tu analysé et cree un cahier des charge pour une echipe complet de developeur pour sa realisation
deduire les diferent tache a execute pour la realisation complet 
decouper ces tache en sous tache la plus petite possible 
deduire aussi toute les tache et sous tache a joute pour que la plateforme des commerciaux puisse avoire les fonctiionalité basic de whatsapp (la messagagerier instentaner et autre pouvent aide dans l'evaluation des commerciaux) apres avoire genere le cahier des charge faite une autocritique du chaier des charge et corrige les inchoerence et imperfection et fait en sorte que le caher des charge puisse etre tres detaille pour que un IA de codage meme si elle n'est pas assez performent puissent realiser le proget 

les detail pour l'IA a chaque fois quel fini une tache elle doit effectuer un commit et un push pour que je puisse valide l'avencment du projet et apres confirmation elle continue 
si elle rencontre une tache qui prend assez de temps ou bloque elle effectue un commit et attend encore que je reccupere et verifie et test sont avencement en locales et apres confirmation elle avence et elle doit faire tous ces retours en françair 

elle doit aussi respecte les regle de la clienne architecture et du clean code 
elle doit respecter le cahier des charge 