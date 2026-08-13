import type { TranslationKey } from './pt';

/**
 * The French dictionary. Typed as `Record<TranslationKey, string>` — an
 * object literal checked against that type must have every key `pt.ts`
 * declares and no others, so a key added to one file and forgotten in the
 * other is a compile error here, not a string that silently falls back to
 * Portuguese in production.
 */
export const fr: Record<TranslationKey, string> = {
  /* ── Navigation (tab bar) ─────────────────────────────────────────── */
  'nav.home': 'Accueil',
  'nav.search': 'Rechercher',
  'nav.plan': 'Semaine',
  'nav.book': 'Mon livre',
  'nav.more': 'Plus',

  /* ── Home ─────────────────────────────────────────────────────────── */
  'home.switchLanguage': 'Changer de langue',
  'home.profile': 'Profil',
  'home.greeting': 'Salut, qu’est-ce qu’on va cuisiner aujourd’hui ?',
  'home.chefLineThinking': 'Laisse-moi faire. Je prépare une recette avec ce que tu as…',
  'home.chefLineErrorGeneric': 'Je n’ai pas pu répondre pour l’instant.',
  'home.chefLineGotRecipe':
    'Celle-ci te tente ? Si tu veux, demande un ajustement — plus rapide, sans lactose, une autre coupe.',
  'home.chefLineDefault':
    'Dis-moi ce que tu as, ce que tu veux cuisiner, ou envoie une recette. Je suis là pour t’aider.',
  'home.searchPlaceholder': 'Dis ce que tu as ou ce que tu veux cuisiner…',
  'home.searchAriaLabel': 'Ce que tu as ou ce que tu veux cuisiner',
  'home.photo': 'Photo',
  'home.stopRecording': 'Arrêter l’enregistrement',
  'home.speak': 'Parler',
  'home.send': 'Envoyer',
  'home.listening': 'Écoute…',
  'home.stop': 'Arrêter',
  'home.speechErrorNotAllowed': 'Autorisez le micro pour parler au chef.',
  'home.speechErrorNoSpeech': "Je n'ai rien entendu. Réessayez.",
  'home.speechErrorNetwork': 'Pas de connexion pour reconnaître la voix. Réessayez.',
  'home.speechErrorGeneric': "Je n'ai pas réussi à vous entendre. Réessayez.",
  'home.whichAppliances': 'Avec quels appareils ?',
  'home.canPickSeveral': 'Tu peux en cocher plusieurs.',
  'home.savingRecipe': 'Enregistrement…',
  'home.viewRecipe': 'Voir la recette',
  'home.adjust': 'Ajuster',
  'home.couldNotSave': 'Impossible d’enregistrer.',
  'home.orTakePhoto': 'Ou prends une photo du frigo',
  'home.shortcuts': 'Raccourcis',
  'home.shortcutPantry': 'Avec ce que j’ai',
  'home.shortcutImport': 'Importer une recette',
  'home.orLetMeDecide': 'Ou laisse-moi choisir',
  'home.emptyTitle': 'Pas encore de recette',
  'home.emptyDescription':
    'Publie des recettes depuis le back-office, ou lance le seed du Supabase pour commencer.',
  'home.todaysSuggestion': 'Suggestion du jour',
  'home.servingsSuffix': 'portions',
  'home.ingredientsSuffix': 'ingrédients',
  'home.pathSingular': 'façon',
  'home.pathPlural': 'façons',
  'home.difficultyEasy': 'Facile',
  'home.difficultyMedium': 'Moyen',
  'home.difficultyHard': 'Difficile',
  'home.anotherIdea': 'Une autre idée',

  /* ── Plus ─────────────────────────────────────────────────────────── */
  'more.title': 'Plus',
  'more.kitchen': 'Cuisine',
  'more.shoppingList': 'Liste de courses',
  'more.shoppingListDesc': 'Ce qu’il manque pour ta semaine',
  'more.favorites': 'Favoris',
  'more.favoritesDesc': 'Recettes que tu as enregistrées',
  'more.importRecipe': 'Importer une recette',
  'more.importRecipeDesc': 'Lien, photo, capture ou PDF',
  'more.tracking': 'Suivi',
  'more.logCalories': 'Enregistrer les calories',
  'more.logCaloriesDesc': 'Journal du jour, sans obligation',
  'more.myProfile': 'Mon profil',
  'more.myProfileDesc': 'Chef, restrictions et portions',
  'more.myEquipment': 'Mes équipements',
  'more.myEquipmentDesc': 'Ce que tu as chez toi',
  'more.admin': 'Administration',
  'more.imports': 'Imports',
  'more.importsDesc': 'Apporter des recettes d’autres sources au catalogue',
  'more.language': 'Langue',
  'more.languageDesc':
    'Change le texte de l’application. Les recettes restent telles qu’elles ont été écrites.',

  /* ── Mon profil ───────────────────────────────────────────────────── */
  'profile.title': 'Mon profil',
  'profile.yourChef': 'Ton chef',
  'profile.usualServings': 'Portions habituelles',
  'profile.fewerServings': 'Moins de portions',
  'profile.moreServings': 'Plus de portions',
  'profile.yourKitchen': 'Ta cuisine',
  'profile.noEquipment': 'Aucun équipement configuré pour l’instant.',
  'profile.appliancesSuffix': 'appareils',
  'profile.yourAnswers': 'Tes réponses',
  'profile.skillLevel': 'Niveau en cuisine',
  'profile.prefCuisine': 'Cuisines préférées',
  'profile.prefStyle': 'Style de cuisine',
  'profile.prefTime': 'Temps disponible',
  'profile.prefRestriction': 'Restrictions',
  'profile.onboardingRow': 'Configuration initiale',
  'profile.completedOn': 'Terminée le {date}',
  'profile.redoOnboarding': 'Refaire la configuration initiale',
  'profile.cookModeSettings': 'En mode cuisine',
  'profile.keepScreenOn': 'Garder l’écran allumé',
  'profile.keepScreenOnHint': 'Plus besoin de déverrouiller le téléphone avec les mains sales.',
  'profile.timerSound': 'Son du minuteur',
  'profile.timerSoundHint': 'Un signal quand le temps est écoulé.',
  'profile.install': 'Installer sur l’écran d’accueil',
  'profile.installIOSHint':
    'Sur iPhone : appuie sur Partager, puis sur « Ajouter à l’écran d’accueil ».',
  'profile.signOut': 'Se déconnecter',

  /* ── Onboarding ───────────────────────────────────────────────────── */
  'onboarding.step': 'Étape {step} sur 2',
  'onboarding.chefQuestion': 'Quel chef te correspond ?',
  'onboarding.chefQuestionDesc':
    'Il ajuste les portions, les ingrédients et la nutrition de chaque recette. Tu peux changer d’avis quand tu veux.',
  'onboarding.chefRadioGroupLabel': 'Choix du chef',
  'onboarding.equipmentQuestion': 'Qu’est-ce que tu as dans ta cuisine ?',
  'onboarding.equipmentQuestionDesc':
    'Chaque recette a plusieurs façons d’être préparée. Cocher tes équipements met la bonne en premier.',
  'onboarding.equipmentGroupLabel': 'Équipements de ta cuisine',
  'onboarding.saveError': 'Impossible d’enregistrer. Réessaie.',
  'onboarding.back': 'Retour',
  'onboarding.continueButton': 'Continuer',
  'onboarding.finishing': 'Enregistrement…',
  'onboarding.startCooking': 'Commencer à cuisiner',

  /* ── Chef modes ───────────────────────────────────────────────────── */
  'chefMode.normal.description':
    'Équilibré, professionnel et toujours prêt. Ton chef du quotidien.',
  'chefMode.gourmand.description':
    'Passionné par les saveurs et les bonnes expériences. Généreux et chaleureux.',
  'chefMode.fit.description':
    'Léger, actif et discipliné. Un équilibre entre santé, plaisir et performance.',

  /* ── Equipment short labels ───────────────────────────────────────── */
  'equipment.air_fryer': 'Air Fryer',
  'equipment.oven': 'Four',
  'equipment.stovetop': 'Plaque',
  'equipment.thermomix': 'Thermomix',
  'equipment.microwave': 'Micro-ondes',
  'equipment.blender': 'Mixeur',
  'equipment.pressure_cooker': 'Cocotte',
  'equipment.electric_cooker': 'Cocotte électrique',
  'equipment.barbecue': 'Barbecue',
  'equipment.sous_vide': 'Sous-vide',
  'equipment.other': 'Autre',
  'equipment.none': 'Plan de travail',
};
