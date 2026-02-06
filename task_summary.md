La refactorisation du système de gestion des utilisateurs, séparant les administrateurs des commerciaux, a été complétée. Voici un résumé détaillé des changements effectués :

**Backend (`message_whatsapp`) :**

1.  **Module Admin dédié :**
    *   Création de l'entité `Admin` (`src/admin/entities/admin.entity.ts`) avec ses propres champs d'authentification (`email`, `name`, `password`, `salt`).
    *   Création de `src/admin/admin.service.ts` (`AdminService`) pour gérer la logique métier des administrateurs, incluant la vérification et la création d'un administrateur par défaut (`ensureAdminUserExists`).
    *   Création de `src/admin/admin.module.ts` pour encapsuler la logique du module `Admin`.
    *   Le `AppModule` (`src/app.module.ts`) a été mis à jour pour importer `AdminModule` et inclure l'entité `Admin` dans `TypeOrmModule.forFeature`.
    *   Le fichier `src/main.ts` a été modifié pour appeler `AdminService.ensureAdminUserExists()` au démarrage de l'application, assurant la présence d'un admin par défaut si nécessaire (email: `admin@admin.com`, mot de passe: `adminpassword`).

2.  **Module d'Authentification Admin séparé (`AuthAdmin`) :**
    *   Création de `src/auth_admin/dto/login_admin.dto.ts` pour les données de connexion spécifiques aux administrateurs.
    *   Création de `src/auth_admin/types/auth_admin_user.types.ts` pour le type d'utilisateur administrateur.
    *   Création de `src/auth_admin/jwt_admin.strategy.ts` pour une stratégie JWT dédiée aux administrateurs (`jwt-admin`).
    *   Création de `src/auth_admin/auth_admin.service.ts` pour la logique d'authentification des administrateurs.
    *   Création de `src/auth_admin/auth_admin.controller.ts` exposant l'endpoint de connexion pour les administrateurs (`/auth/admin/login`) et la récupération de profil.
    *   Création de `src/auth_admin/auth_admin.module.ts` pour gérer l'authentification des administrateurs.
    *   Le `AppModule` (`src/app.module.ts`) a été mis à jour pour importer `AuthAdminModule`.

3.  **Refactorisation de l'entité Commercial et des modules d'authentification existants :**
    *   La propriété `role` a été supprimée de l'entité `WhatsappCommercial` (`src/whatsapp_commercial/entities/user.entity.ts`).
    *   La méthode `ensureAdminUserExists` a été supprimée de `WhatsappCommercialService` (`src/whatsapp_commercial/whatsapp_commercial.service.ts`), car cette logique a été déplacée vers `AdminService`.
    *   Le type `AuthUser` (`src/auth/types/auth-user.types.ts`) a été mis à jour en supprimant la propriété `role`.
    *   Le `AuthService` (`src/auth/auth.service.ts`) a été mis à jour pour retirer toute logique liée au `role`.
    *   La stratégie `JwtStrategy` (`src/auth/jwt.strategy.ts`) a été mise à jour pour ne plus inclure la propriété `role` dans le payload validé.
    *   Les fichiers `src/auth/roles.guard.ts` et `src/auth/roles.decorator.ts` ont été supprimés.

4.  **Mise à jour des contrôleurs :**
    *   Tous les contrôleurs qui utilisaient `RolesGuard` et le décorateur `@Roles` (`AppController`, `ChannelController`, `WhatsappCommercialController`, `WhatsappPosteController`, `MessageAutoController`) ont été mis à jour. Ils utilisent désormais un simple `AuthGuard('jwt')` pour la protection des routes, en attendant une granularité plus fine si nécessaire.

**Frontend (`admin`) :**

1.  **Mise à jour de `admin/src/app/lib/api.ts` :**
    *   Ajout de la fonction `loginAdmin` pour interagir avec le nouvel endpoint d'authentification administrateur.
2.  **Mise à jour de la page de connexion (`admin/src/app/login/page.tsx`) :**
    *   La page offre maintenant un mécanisme de basculement (`toggle`) pour choisir entre la connexion en tant qu'administrateur ou commercial.
    *   Elle utilise `loginAdmin` ou `login` en fonction du choix, et stocke le `access_token` dans la clé `jwt_token` du `localStorage`.

Ces modifications séparent clairement les entités et processus d'authentification des administrateurs et des commerciaux, tout en fournissant un mécanisme de création d'administrateur par défaut.

Si vous démarrez le backend, un utilisateur admin `admin@admin.com` avec le mot de passe `adminpassword` sera créé. Vous pourrez ensuite vous connecter via le panel admin.

Comment souhaitez-vous que je procède ensuite ?
