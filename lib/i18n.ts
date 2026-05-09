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
