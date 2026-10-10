import { redirect } from 'next/navigation';
import { ProfilReglages } from '@/components/campus/ProfilReglages';
import { currentSession } from '@/lib/server/auth';
import { lireProfil } from '@/lib/server/profil';
import { stockagePret, urlLecture } from '@/lib/server/stockage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profil & paramètres — DAVAR ACADÉMIE' };

/** PROFIL & PARAMÈTRES — la page du prototype, sur la vraie base. */
export default async function ProfilPage() {
  const session = await currentSession();
  if (!session) redirect('/connexion');
  const profil = await lireProfil(session.db, session.user.id);
  if (!profil) redirect('/connexion');

  const photoUrl =
    profil.preferences.photoCle && stockagePret() ? await urlLecture(profil.preferences.photoCle, 300) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 19 }}>Profil & paramètres</h1>
        </div>
      </div>

      <ProfilReglages
        nomInitial={profil.nom}
        email={profil.email}
        membreDepuis={new Date(profil.membreDepuisMs).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        preferencesInitiales={profil.preferences}
        photoUrl={photoUrl}
        depotsPossibles={stockagePret()}
      />
    </>
  );
}
