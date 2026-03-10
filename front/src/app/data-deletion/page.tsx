import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Suppression des données — GICOPS",
  description: "Instructions pour la suppression de vos données personnelles GICOPS",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-3xl">

        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Suppression des données utilisateur
        </h1>
        <p className="mb-8 text-sm text-gray-500">Conformément au RGPD et aux politiques Meta</p>

        <section className="mb-8 rounded-xl border border-blue-100 bg-blue-50 p-6">
          <h2 className="mb-3 text-lg font-semibold text-blue-800">
            Comment demander la suppression de vos données
          </h2>
          <p className="mb-4 text-blue-700 leading-relaxed">
            Si vous avez interagi avec GICOPS via WhatsApp Business et souhaitez que vos
            données personnelles soient supprimées de nos systèmes, veuillez nous contacter
            directement par e-mail.
          </p>
          <a
            href="mailto:gbamblekevin@gmail.com?subject=Demande%20de%20suppression%20de%20donn%C3%A9es&body=Bonjour%2C%0A%0AJe%20souhaite%20demander%20la%20suppression%20de%20mes%20donn%C3%A9es%20personnelles%20conform%C3%A9ment%20au%20RGPD.%0A%0AMon%20num%C3%A9ro%20WhatsApp%20%3A%20%0A%0AMerci."
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Envoyer une demande de suppression
          </a>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Données supprimées</h2>
          <p className="mb-3 text-gray-700 leading-relaxed">
            Suite à votre demande, nous supprimerons dans un délai de <strong>30 jours</strong> :
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Votre numéro de téléphone et nom d&apos;affichage</li>
            <li>L&apos;historique de vos conversations avec nos équipes</li>
            <li>Les médias échangés (images, documents, audio, vidéo)</li>
            <li>Toutes les métadonnées associées à vos échanges</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Confirmation</h2>
          <p className="text-gray-700 leading-relaxed">
            Vous recevrez une confirmation par e-mail une fois la suppression effectuée.
            Notez que certaines données peuvent être conservées si la loi l&apos;exige (obligations
            comptables, fiscales, ou procédures judiciaires en cours).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold text-gray-800">Contact</h2>
          <ul className="list-none space-y-1 text-gray-700">
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
