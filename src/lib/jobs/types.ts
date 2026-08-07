/**
 * Jobbannonser är strukturerad data, inte fritext.
 *
 * En `NewsItem` med rubrik, ingress och länk passar dåligt för en annons: det
 * intressanta för en account manager är *var* bolaget rekryterar, *vad* för
 * roll, och *hur många* annonser som ligger ute samtidigt. Tre annonser till
 * produktionspersonal i samma ort är en expansionssignal; en enskild
 * ekonomiassistent är det inte. Den bedömningen går inte att göra på en
 * rubriksträng, därför egna fält.
 */
export interface JobAdHit {
  /** JobTechs annons-id. Stabilt över tid, till skillnad från annons-URL:en. */
  externalId: string;
  headline: string;
  /** Arbetsgivarens namn så som Arbetsförmedlingen har det registrerat. */
  employerName: string;
  /** Arbetsställets namn — ofta det namn bolaget faktiskt går under. */
  workplaceName: string | null;
  /** Organisationsnummer när annonsören uppgett det. */
  organizationNumber: string | null;
  occupation: string | null;
  municipality: string | null;
  region: string | null;
  url: string;
  publishedAt: Date | null;
  /** Sista ansökningsdag. Efter den är annonsen inte längre en färsk signal. */
  deadline: Date | null;
}
