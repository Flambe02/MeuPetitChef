/**
 * The pt-BR dictionary — the app's own language, and the source of truth for
 * every key that exists. `fr.ts` is typed against this file's shape, so
 * adding a key here without adding it there is a compile error, not a
 * silent gap discovered in production.
 *
 * Scope, deliberately: the tab bar, Home, "Mais", "Meu perfil" and
 * onboarding — the screens a new bilingual user reaches first. Every other
 * screen still reads its own hardcoded pt-BR strings directly; extending
 * this dictionary to them is exactly that, an extension, one screen at a
 * time, not a rewrite of this file's shape.
 */
export const pt = {
  /* ── Navigation (tab bar) ─────────────────────────────────────────── */
  'nav.home': 'Início',
  'nav.search': 'Buscar',
  'nav.plan': 'Semana',
  'nav.book': 'Meu livro',
  'nav.more': 'Mais',

  /* ── Home ─────────────────────────────────────────────────────────── */
  'home.switchLanguage': 'Mudar idioma',
  'home.profile': 'Perfil',
  'home.greeting': 'Olá, o que vamos cozinhar hoje?',
  'home.chefLineThinking': 'Deixa comigo. Estou montando uma receita com o que você tem…',
  'home.chefLineErrorGeneric': 'Não consegui responder agora.',
  'home.chefLineGotRecipe':
    'Que tal esta? Se quiser, peça um ajuste — mais rápido, sem lactose, outro corte.',
  'home.chefLineDefault':
    'Me diga o que você tem, o que deseja cozinhar ou envie uma receita. Estou aqui para ajudar.',
  'home.searchPlaceholder': 'Diga o que você tem ou quer cozinhar…',
  'home.searchAriaLabel': 'O que você tem ou quer cozinhar',
  'home.photo': 'Foto',
  'home.stopRecording': 'Parar de gravar',
  'home.speak': 'Falar',
  'home.send': 'Enviar',
  'home.listening': 'Ouvindo…',
  'home.stop': 'Parar',
  'home.speechErrorNotAllowed': 'Permita o uso do microfone para falar com o chef.',
  'home.speechErrorNoSpeech': 'Não ouvi nada. Tente falar de novo.',
  'home.speechErrorNetwork': 'Sem conexão para reconhecer a fala. Tente de novo.',
  'home.speechErrorGeneric': 'Não consegui ouvir. Tente de novo.',
  'home.whichAppliances': 'Com quais aparelhos?',
  'home.canPickSeveral': 'Pode marcar vários.',
  'home.savingRecipe': 'Salvando…',
  'home.viewRecipe': 'Ver a receita',
  'home.adjust': 'Ajustar',
  'home.couldNotSave': 'Não foi possível salvar.',
  'home.orTakePhoto': 'Ou tire uma foto da geladeira',
  'home.shortcuts': 'Atalhos',
  'home.shortcutPantry': 'Com o que tenho',
  'home.shortcutImport': 'Importar receita',
  'home.orLetMeDecide': 'Ou deixe comigo',
  'home.emptyTitle': 'Nenhuma receita ainda',
  'home.emptyDescription': 'Publique receitas no back-office ou rode o seed do Supabase para começar.',
  'home.todaysSuggestion': 'Sugestão de hoje',
  'home.servingsSuffix': 'porções',
  'home.ingredientsSuffix': 'ingredientes',
  'home.pathSingular': 'caminho',
  'home.pathPlural': 'caminhos',
  'home.difficultyEasy': 'Fácil',
  'home.difficultyMedium': 'Médio',
  'home.difficultyHard': 'Difícil',
  'home.anotherIdea': 'Outra ideia',

  /* ── Mais ─────────────────────────────────────────────────────────── */
  'more.title': 'Mais',
  'more.kitchen': 'Cozinha',
  'more.shoppingList': 'Lista de compras',
  'more.shoppingListDesc': 'Do que falta para a sua semana',
  'more.favorites': 'Favoritos',
  'more.favoritesDesc': 'Receitas que você guardou',
  'more.importRecipe': 'Importar receita',
  'more.importRecipeDesc': 'Link, foto, captura ou PDF',
  'more.tracking': 'Acompanhamento',
  'more.logCalories': 'Registrar calorias',
  'more.logCaloriesDesc': 'Diário do dia, sem obrigação',
  'more.myProfile': 'Meu perfil',
  'more.myProfileDesc': 'Chef, restrições e porções',
  'more.myEquipment': 'Meus equipamentos',
  'more.myEquipmentDesc': 'O que você tem em casa',
  'more.admin': 'Administração',
  'more.imports': 'Importações',
  'more.importsDesc': 'Trazer receitas de outras fontes para o catálogo',
  'more.language': 'Idioma',
  'more.languageDesc': 'Muda o texto do aplicativo. As receitas continuam como foram escritas.',

  /* ── Meu perfil ───────────────────────────────────────────────────── */
  'profile.title': 'Meu perfil',
  'profile.yourChef': 'Seu chef',
  'profile.usualServings': 'Porções habituais',
  'profile.fewerServings': 'Menos porções',
  'profile.moreServings': 'Mais porções',
  'profile.yourKitchen': 'Sua cozinha',
  'profile.noEquipment': 'Nenhum equipamento configurado ainda.',
  'profile.appliancesSuffix': 'aparelhos',
  'profile.yourAnswers': 'Suas respostas',
  'profile.skillLevel': 'Nível na cozinha',
  'profile.prefCuisine': 'Cozinhas preferidas',
  'profile.prefStyle': 'Estilo de cozinhar',
  'profile.prefTime': 'Tempo disponível',
  'profile.prefRestriction': 'Restrições',
  'profile.onboardingRow': 'Onboarding',
  'profile.completedOn': 'Concluído em {date}',
  'profile.redoOnboarding': 'Refazer o onboarding',
  'profile.cookModeSettings': 'No modo cozinha',
  'profile.keepScreenOn': 'Manter a tela acesa',
  'profile.keepScreenOnHint': 'Nada de desbloquear o telefone com as mãos sujas.',
  'profile.timerSound': 'Som do timer',
  'profile.timerSoundHint': 'Um toque quando o tempo acaba.',
  'profile.install': 'Instalar na tela de início',
  'profile.installIOSHint': 'No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.',
  'profile.signOut': 'Sair da conta',

  /* ── Onboarding ───────────────────────────────────────────────────── */
  'onboarding.step': 'Passo {step} de 2',
  'onboarding.chefQuestion': 'Qual chef combina com você?',
  'onboarding.chefQuestionDesc':
    'Ele ajusta as porções, os ingredientes e a nutrição de cada receita. Dá para trocar quando quiser.',
  'onboarding.chefRadioGroupLabel': 'Escolha do chef',
  'onboarding.equipmentQuestion': 'O que você tem na cozinha?',
  'onboarding.equipmentQuestionDesc':
    'Cada receita tem vários caminhos. Marcar seus equipamentos coloca o caminho certo em primeiro lugar.',
  'onboarding.equipmentGroupLabel': 'Equipamentos da sua cozinha',
  'onboarding.saveError': 'Não foi possível salvar. Tente de novo.',
  'onboarding.back': 'Voltar',
  'onboarding.continueButton': 'Continuar',
  'onboarding.finishing': 'Salvando…',
  'onboarding.startCooking': 'Começar a cozinhar',

  /* ── Chef modes (shared by Home, Meu perfil, Onboarding) ─────────────
     Labels ("Normal", "Gourmand", "Fit") are not translated — they read the
     same evocative way in both languages. Only the description differs. */
  'chefMode.normal.description': 'Equilibrado, profissional e sempre preparado. Seu chef do dia a dia.',
  'chefMode.gourmand.description': 'Apaixonado por sabores e boas experiências. Generoso e acolhedor.',
  'chefMode.fit.description': 'Leve, ativo e disciplinado. Equilíbrio entre saúde, prazer e performance.',

  /* ── Equipment short labels (shared by Onboarding, Meu perfil) ───────── */
  'equipment.air_fryer': 'Air Fryer',
  'equipment.oven': 'Forno',
  'equipment.stovetop': 'Fogão',
  'equipment.thermomix': 'Thermomix',
  'equipment.microwave': 'Micro-ondas',
  'equipment.blender': 'Liquidificador',
  'equipment.pressure_cooker': 'Pressão',
  'equipment.electric_cooker': 'Panela elétrica',
  'equipment.barbecue': 'Churrasco',
  'equipment.sous_vide': 'Sous-vide',
  'equipment.other': 'Outro',
  'equipment.none': 'Bancada',
} as const;

export type TranslationKey = keyof typeof pt;
