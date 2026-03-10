import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité — GICOPS",
  description: "Politique de confidentialité de l'application GICOPS WhatsApp Business",
};

export default function PrivacyPolicyPage() {
  const lastUpdated = "10 mars 2026";

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-3xl">

        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Politique de confidentialité
        </h1>
        <p className="mb-8 text-sm text-gray-500">Dernière mise à jour : {lastUpdated}</p>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">1. Présentation</h2>
          <p className="text-gray-700 leading-relaxed">
            GICOPS (&quot;nous&quot;, &quot;notre&quot;, &quot;nos&quot;) exploite une plateforme de gestion et de
            dispatching des conversations WhatsApp Business destinée à ses équipes commerciales.
            Cette politique de confidentialité décrit comment nous collectons, utilisons et
            protégeons les données personnelles traitées via notre application.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">2. Données collectées</h2>
          <p className="mb-3 text-gray-700 leading-relaxed">
            Dans le cadre de l&apos;utilisation de l&apos;application, nous pouvons collecter les données suivantes :
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Numéro de téléphone WhatsApp des contacts clients</li>
            <li>Nom d&apos;affichage des contacts (tel que fourni par WhatsApp)</li>
            <li>Contenu des messages échangés via WhatsApp Business</li>
            <li>Médias partagés dans les conversations (images, documents, audio, vidéo)</li>
            <li>Métadonnées de messagerie (horodatage, statut de lecture/livraison)</li>
            <li>Informations de connexion des agents internes (nom, identifiant de poste)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">3. Utilisation des données</h2>
          <p className="mb-3 text-gray-700 leading-relaxed">
            Les données collectées sont utilisées exclusivement pour :
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Acheminer et dispatcher les conversations clients vers les agents disponibles</li>
            <li>Permettre la prise en charge et le suivi des échanges commerciaux</li>
            <li>Envoyer des messages automatiques de bienvenue ou de suivi</li>
            <li>Générer des statistiques internes de performance et de qualité de service</li>
            <li>Assurer la traçabilité des échanges à des fins de conformité interne</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">4. Base légale du traitement</h2>
          <p className="text-gray-700 leading-relaxed">
            Le traitement des données personnelles repose sur l&apos;intérêt légitime de GICOPS à gérer
            efficacement ses relations commerciales, ainsi que sur l&apos;exécution contractuelle dans
            le cadre des services fournis aux clients. Les agents internes consentent au traitement
            de leurs données dans le cadre de leur contrat de travail.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">5. Partage des données</h2>
          <p className="text-gray-700 leading-relaxed">
            Nous ne vendons ni ne louons vos données personnelles à des tiers. Les données peuvent
            être transmises à des sous-traitants techniques (hébergeur, fournisseur d&apos;API WhatsApp)
            uniquement dans la mesure nécessaire au fonctionnement du service, et conformément au
            RGPD. Ces sous-traitants sont contractuellement tenus de garantir la confidentialité
            et la sécurité des données.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">6. Conservation des données</h2>
          <p className="text-gray-700 leading-relaxed">
            Les données de conversation sont conservées pendant une durée maximale de 24 mois à
            compter de la dernière interaction, sauf obligation légale de conservation plus longue.
            Les données des comptes agents sont supprimées dans les 30 jours suivant la fin du
            contrat de travail.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">7. Sécurité</h2>
          <p className="text-gray-700 leading-relaxed">
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour
            protéger vos données personnelles contre tout accès non autorisé, modification,
            divulgation ou destruction. L&apos;accès à l&apos;application est restreint aux agents
            authentifiés via un système de jetons JWT sécurisés.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">8. Droits des personnes</h2>
          <p className="mb-3 text-gray-700 leading-relaxed">
            Conformément au RGPD, vous disposez des droits suivants concernant vos données :
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Droit d&apos;accès à vos données personnelles</li>
            <li>Droit de rectification des données inexactes</li>
            <li>Droit à l&apos;effacement (&quot;droit à l&apos;oubli&quot;)</li>
            <li>Droit à la limitation du traitement</li>
            <li>Droit à la portabilité des données</li>
            <li>Droit d&apos;opposition au traitement</li>
          </ul>
          <p className="mt-3 text-gray-700 leading-relaxed">
            Pour exercer ces droits, veuillez nous contacter à :{" "}
            <a href="mailto:gbamblekevin@gmail.com" className="text-blue-600 underline">
              gbamblekevin@gmail.com
            </a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">9. Cookies et traceurs</h2>
          <p className="text-gray-700 leading-relaxed">
            Notre application utilise uniquement des cookies techniques strictement nécessaires
            au fonctionnement du service (authentification par cookie HTTP-only). Aucun cookie
            publicitaire ou de traçage tiers n&apos;est utilisé.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">10. Utilisation de l&apos;API WhatsApp Business</h2>
          <p className="text-gray-700 leading-relaxed">
            Notre application utilise l&apos;API WhatsApp Business (Meta) pour la gestion des
            conversations. L&apos;utilisation de cette API est soumise aux{" "}
            <a
              href="https://www.whatsapp.com/legal/business-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Conditions d&apos;utilisation de WhatsApp Business
            </a>{" "}
            et à la{" "}
            <a
              href="https://www.facebook.com/privacy/policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Politique de confidentialité de Meta
            </a>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">11. Modifications de cette politique</h2>
          <p className="text-gray-700 leading-relaxed">
            Nous nous réservons le droit de modifier cette politique de confidentialité à tout
            moment. Toute modification sera publiée sur cette page avec une date de mise à jour.
            Nous vous encourageons à consulter régulièrement cette page.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">12. Contact</h2>
          <p className="text-gray-700 leading-relaxed">
            Pour toute question relative à cette politique de confidentialité, vous pouvez
            nous contacter :
          </p>
          <ul className="mt-3 list-none space-y-1 text-gray-700">
            <li><strong>Société :</strong> GICOPS</li>
            <li>
              <strong>E-mail :</strong>{" "}
              <a href="mailto:gbamblekevin@gmail.com" className="text-blue-600 underline">
                gbamblekevin@gmail.com
              </a>
            </li>
          </ul>
        </section>

        <hr className="my-8 border-gray-200" />
        <p className="text-center text-xs text-gray-400">
          © {new Date().getFullYear()} GICOPS — Tous droits réservés
        </p>
      </div>
    </main>
  );
}
