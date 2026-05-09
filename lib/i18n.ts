export const SUPPORTED_LOCALES = ["en", "fr", "es"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "gulera_os_locale_v1";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Francais",
  es: "Espanol",
};

export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  en: "EN",
  fr: "FR",
  es: "ES",
};

export const dictionaries = {
  en: {
    common: {
      language: "Language",
      terms: "Terms",
      privacy: "Privacy",
      cookies: "Cookies",
      essentialOnly: "Essential only",
      accept: "Accept",
    },
    legalConsent: {
      title: "Privacy and cookies",
      body:
        "Gulera OS uses essential cookies and local browser storage for login, security, and core portal features. If analytics or optional tools are added during testing, they should only run after consent.",
    },
    welcome: {
      title: "Welcome to Gulera OS",
      body: "Let's get your system set up in a couple quick steps.",
      dashboard: "Go to Dashboard",
      firstProperty: "Create your first property",
      footer: "You can always come back here later from your dashboard.",
    },
    login: {
      eyebrow: "Gulera OS",
      title: "Company Admin Access",
      intro:
        "Sign in to your existing workspace or create a new company account. Staff and owner access is managed by invitation from inside each company workspace.",
      adminTitle: "For company admins",
      adminBody: "Launch your own isolated Gulera OS workspace.",
      teamTitle: "For invited team members",
      teamBody: "Cleaner, grounds, and owner access should come from an admin invite.",
      returningTitle: "For returning users",
      returningBody: "Use the login tab to access your existing portal.",
      ownerTitle: "Looking for owner access?",
      ownerBody: "Owners sign in through the separate owner portal login page.",
      ownerLink: "Go to Owner Login",
      loginTab: "Login",
      companyTab: "Create Company",
      loginHeading: "Login",
      loginSubheading: "Existing staff or admin account",
      ownerHelpTitle: "Owner trying to sign in?",
      ownerHelpBody: "Use the dedicated owner portal here:",
      email: "Email",
      password: "Password",
      loggingIn: "Logging in...",
      forgotPassword: "Forgot password?",
      sending: "Sending...",
      resendConfirmation: "Resend confirmation",
      createCompanyHeading: "Create Company Account",
      createCompanySubheading: "Start your own Gulera OS workspace as the first admin for your company",
      testingNotice:
        "Gulera OS is currently in a testing phase. Features may change, errors may occur, and important operational or invoice details should be reviewed before relying on them.",
      fullName: "Full name",
      phoneNumber: "Phone number",
      workEmail: "Work email",
      companyName: "Company name",
      confirmPassword: "Confirm password",
      hide: "Hide",
      show: "Show",
      testingAgreementPrefix: "I understand Gulera OS is in testing and agree to the",
      privacyPolicy: "Privacy Policy",
      cookieNotice: "Cookie Notice",
      creatingCompany: "Creating company...",
      createCompanyButton: "Create Company Account",
      legalFooter: "This creates the first admin account for a new company workspace. Legal text is available anytime:",
    },
    ownerLogin: {
      eyebrow: "Gulera OS Owner Portal",
      title: "Owner Login",
      intro: "Sign in with your email and password. You can also request a fresh login link if needed.",
      checking: "Checking your owner session...",
      stuck: "Already stuck in the wrong owner session?",
      switchAccount: "Sign out and switch account",
      email: "Email",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      hide: "Hide",
      show: "Show",
      signingIn: "Signing in...",
      logIn: "Log In",
      sending: "Sending...",
      emailLink: "Email Me a Login Link",
      legalPrefix: "By using the owner portal, you agree to the",
      privacyPolicy: "Privacy Policy",
      cookieNotice: "Cookie Notice",
    },
  },
  fr: {
    common: {
      language: "Langue",
      terms: "Conditions",
      privacy: "Confidentialite",
      cookies: "Témoins",
      essentialOnly: "Essentiels seulement",
      accept: "Accepter",
    },
    legalConsent: {
      title: "Confidentialite et témoins",
      body:
        "Gulera OS utilise des témoins essentiels et le stockage local du navigateur pour la connexion, la securite et les fonctions principales du portail. Si des analyses ou des outils facultatifs sont ajoutes pendant les essais, ils ne devraient fonctionner qu'apres consentement.",
    },
    welcome: {
      title: "Bienvenue dans Gulera OS",
      body: "Configurons votre systeme en quelques etapes rapides.",
      dashboard: "Aller au tableau de bord",
      firstProperty: "Creer votre premiere propriete",
      footer: "Vous pouvez toujours revenir ici plus tard depuis votre tableau de bord.",
    },
    login: {
      eyebrow: "Gulera OS",
      title: "Acces administrateur d'entreprise",
      intro:
        "Connectez-vous a votre espace de travail existant ou creez un nouveau compte d'entreprise. L'acces du personnel et des proprietaires est gere par invitation dans chaque espace de travail.",
      adminTitle: "Pour les administrateurs",
      adminBody: "Lancez votre propre espace de travail Gulera OS isole.",
      teamTitle: "Pour les membres invites",
      teamBody: "L'acces des nettoyeurs, du terrain et des proprietaires doit venir d'une invitation admin.",
      returningTitle: "Pour les utilisateurs existants",
      returningBody: "Utilisez l'onglet de connexion pour acceder a votre portail.",
      ownerTitle: "Vous cherchez l'acces proprietaire?",
      ownerBody: "Les proprietaires se connectent par la page separee du portail proprietaire.",
      ownerLink: "Aller a la connexion proprietaire",
      loginTab: "Connexion",
      companyTab: "Creer une entreprise",
      loginHeading: "Connexion",
      loginSubheading: "Compte personnel ou admin existant",
      ownerHelpTitle: "Proprietaire qui tente de se connecter?",
      ownerHelpBody: "Utilisez le portail proprietaire dedie ici:",
      email: "Courriel",
      password: "Mot de passe",
      loggingIn: "Connexion...",
      forgotPassword: "Mot de passe oublie?",
      sending: "Envoi...",
      resendConfirmation: "Renvoyer la confirmation",
      createCompanyHeading: "Creer un compte d'entreprise",
      createCompanySubheading: "Demarrez votre espace Gulera OS comme premier administrateur de votre entreprise",
      testingNotice:
        "Gulera OS est actuellement en phase de test. Les fonctions peuvent changer, des erreurs peuvent se produire, et les details operationnels ou de facturation importants doivent etre verifies.",
      fullName: "Nom complet",
      phoneNumber: "Numero de telephone",
      workEmail: "Courriel professionnel",
      companyName: "Nom de l'entreprise",
      confirmPassword: "Confirmer le mot de passe",
      hide: "Masquer",
      show: "Afficher",
      testingAgreementPrefix: "Je comprends que Gulera OS est en test et j'accepte les",
      privacyPolicy: "Politique de confidentialite",
      cookieNotice: "Avis sur les témoins",
      creatingCompany: "Creation de l'entreprise...",
      createCompanyButton: "Creer le compte d'entreprise",
      legalFooter: "Cela cree le premier compte administrateur pour un nouvel espace d'entreprise. Le texte legal est disponible en tout temps:",
    },
    ownerLogin: {
      eyebrow: "Portail proprietaire Gulera OS",
      title: "Connexion proprietaire",
      intro: "Connectez-vous avec votre courriel et votre mot de passe. Vous pouvez aussi demander un nouveau lien de connexion.",
      checking: "Verification de votre session proprietaire...",
      stuck: "Toujours bloque dans la mauvaise session proprietaire?",
      switchAccount: "Se deconnecter et changer de compte",
      email: "Courriel",
      password: "Mot de passe",
      passwordPlaceholder: "Entrez votre mot de passe",
      hide: "Masquer",
      show: "Afficher",
      signingIn: "Connexion...",
      logIn: "Connexion",
      sending: "Envoi...",
      emailLink: "Envoyez-moi un lien de connexion",
      legalPrefix: "En utilisant le portail proprietaire, vous acceptez les",
      privacyPolicy: "Politique de confidentialite",
      cookieNotice: "Avis sur les témoins",
    },
  },
  es: {
    common: {
      language: "Idioma",
      terms: "Terminos",
      privacy: "Privacidad",
      cookies: "Cookies",
      essentialOnly: "Solo esenciales",
      accept: "Aceptar",
    },
    legalConsent: {
      title: "Privacidad y cookies",
      body:
        "Gulera OS usa cookies esenciales y almacenamiento local del navegador para el inicio de sesion, la seguridad y las funciones principales del portal. Si se agregan analiticas o herramientas opcionales durante las pruebas, solo deberian funcionar despues del consentimiento.",
    },
    welcome: {
      title: "Bienvenido a Gulera OS",
      body: "Configuremos tu sistema en unos pasos rapidos.",
      dashboard: "Ir al panel",
      firstProperty: "Crear tu primera propiedad",
      footer: "Siempre puedes volver aqui mas tarde desde tu panel.",
    },
    login: {
      eyebrow: "Gulera OS",
      title: "Acceso de administrador",
      intro:
        "Inicia sesion en tu espacio existente o crea una nueva cuenta de empresa. El acceso del personal y propietarios se gestiona por invitacion dentro de cada espacio.",
      adminTitle: "Para administradores",
      adminBody: "Crea tu propio espacio aislado de Gulera OS.",
      teamTitle: "Para miembros invitados",
      teamBody: "El acceso de limpieza, jardineria y propietarios debe venir de una invitacion del administrador.",
      returningTitle: "Para usuarios existentes",
      returningBody: "Usa la pestana de inicio de sesion para entrar a tu portal.",
      ownerTitle: "Buscas acceso de propietario?",
      ownerBody: "Los propietarios inician sesion en la pagina separada del portal de propietarios.",
      ownerLink: "Ir al inicio de propietario",
      loginTab: "Iniciar sesion",
      companyTab: "Crear empresa",
      loginHeading: "Iniciar sesion",
      loginSubheading: "Cuenta existente de personal o administrador",
      ownerHelpTitle: "Propietario intentando entrar?",
      ownerHelpBody: "Usa el portal de propietarios aqui:",
      email: "Correo",
      password: "Contrasena",
      loggingIn: "Iniciando sesion...",
      forgotPassword: "Olvidaste tu contrasena?",
      sending: "Enviando...",
      resendConfirmation: "Reenviar confirmacion",
      createCompanyHeading: "Crear cuenta de empresa",
      createCompanySubheading: "Inicia tu espacio Gulera OS como primer administrador de tu empresa",
      testingNotice:
        "Gulera OS esta actualmente en fase de prueba. Las funciones pueden cambiar, pueden ocurrir errores, y los detalles operativos o de facturacion importantes deben revisarse.",
      fullName: "Nombre completo",
      phoneNumber: "Numero de telefono",
      workEmail: "Correo de trabajo",
      companyName: "Nombre de la empresa",
      confirmPassword: "Confirmar contrasena",
      hide: "Ocultar",
      show: "Mostrar",
      testingAgreementPrefix: "Entiendo que Gulera OS esta en pruebas y acepto los",
      privacyPolicy: "Politica de privacidad",
      cookieNotice: "Aviso de cookies",
      creatingCompany: "Creando empresa...",
      createCompanyButton: "Crear cuenta de empresa",
      legalFooter: "Esto crea la primera cuenta de administrador para un nuevo espacio de empresa. El texto legal esta disponible en cualquier momento:",
    },
    ownerLogin: {
      eyebrow: "Portal de propietarios Gulera OS",
      title: "Inicio de propietario",
      intro: "Inicia sesion con tu correo y contrasena. Tambien puedes pedir un nuevo enlace de inicio.",
      checking: "Verificando tu sesion de propietario...",
      stuck: "Aun estas en la sesion de propietario incorrecta?",
      switchAccount: "Cerrar sesion y cambiar cuenta",
      email: "Correo",
      password: "Contrasena",
      passwordPlaceholder: "Ingresa tu contrasena",
      hide: "Ocultar",
      show: "Mostrar",
      signingIn: "Iniciando sesion...",
      logIn: "Iniciar sesion",
      sending: "Enviando...",
      emailLink: "Enviame un enlace de inicio",
      legalPrefix: "Al usar el portal de propietarios, aceptas los",
      privacyPolicy: "Politica de privacidad",
      cookieNotice: "Aviso de cookies",
    },
  },
} as const;

type Dictionary = typeof dictionaries.en;
type DotPrefix<TPrefix extends string, TKey extends string> = `${TPrefix}.${TKey}`;
type TranslationKey<TValue, TPrefix extends string = ""> = TValue extends string
  ? never
  : {
      [Key in Extract<keyof TValue, string>]: TValue[Key] extends string
        ? TPrefix extends ""
          ? Key
          : DotPrefix<TPrefix, Key>
        : TPrefix extends ""
          ? TranslationKey<TValue[Key], Key>
          : TranslationKey<TValue[Key], DotPrefix<TPrefix, Key>>;
    }[Extract<keyof TValue, string>];

export type TranslationPath = TranslationKey<Dictionary>;

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const normalized = value.toLowerCase().split("-")[0];
  return SUPPORTED_LOCALES.includes(normalized as Locale) ? (normalized as Locale) : DEFAULT_LOCALE;
}

export function translate(locale: Locale, path: TranslationPath): string {
  const dictionary = dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
  const fallbackDictionary = dictionaries[DEFAULT_LOCALE];
  const segments = path.split(".");

  let current: unknown = dictionary;
  let fallback: unknown = fallbackDictionary;

  for (const segment of segments) {
    current = typeof current === "object" && current !== null ? (current as Record<string, unknown>)[segment] : undefined;
    fallback = typeof fallback === "object" && fallback !== null ? (fallback as Record<string, unknown>)[segment] : undefined;
  }

  return typeof current === "string" ? current : typeof fallback === "string" ? fallback : path;
}
