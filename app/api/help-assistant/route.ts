import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HelpMessage = {
  role?: unknown;
  content?: unknown;
};

const HELP_DIR = path.join(process.cwd(), "docs", "help");
const HELP_FILES = ["assistant.md", "admin.md", "staff.md", "owners.md", "notifications.md"];

function normalizeQuestion(value: unknown) {
  return String(value || "").trim().slice(0, 1000);
}

function normalizeHistory(value: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: HelpMessage) => {
      const role = item?.role === "user" ? "user" : item?.role === "assistant" ? "assistant" : null;
      const content = String(item?.content || "").trim().slice(0, 1200);
      return role && content ? { role, content } : null;
    })
    .filter((item): item is { role: "user" | "assistant"; content: string } => Boolean(item))
    .slice(-8);
}

async function loadHelpContext() {
  const documents = await Promise.all(
    HELP_FILES.map(async (fileName) => {
      const fullPath = path.join(HELP_DIR, fileName);
      const content = await fs.readFile(fullPath, "utf8");
      return `--- ${fileName} ---\n${content.trim()}`;
    })
  );

  return documents.join("\n\n");
}

function pickLocalFallbackAnswer(question: string, helpContext: string, locale = "en") {
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 3);

  const sections = helpContext.split(/\n(?=## |# )/g);
  const ranked = sections
    .map((section) => {
      const lower = section.toLowerCase();
      const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
      return { section, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const excerpt = (ranked[0]?.section || sections[0] || "")
    .replace(/^--- .* ---\n/, "")
    .trim()
    .slice(0, 850);

  const fallbackCopy =
    locale.startsWith("fr")
      ? {
          intro: "Le service IA n'est pas encore configure, mais j'ai trouve ceci dans les fichiers d'aide:",
          outro: "Ajoutez OPENAI_API_KEY dans Vercel Production pour activer les reponses IA completes.",
        }
      : locale.startsWith("es")
        ? {
            intro: "El servicio de IA aun no esta configurado, pero encontre esto en los archivos de ayuda:",
            outro: "Agrega OPENAI_API_KEY en Vercel Production para activar respuestas completas de IA.",
          }
        : {
            intro: "The AI service is not configured yet, but I found this in the help files:",
            outro: "Add OPENAI_API_KEY in Vercel production to turn on full AI answers.",
          };

  return [fallbackCopy.intro, excerpt, fallbackCopy.outro].join("\n\n");
}

function extractOutputText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("\n").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const question = normalizeQuestion(body?.question);
    const history = normalizeHistory(body?.history);
    const page = String(body?.page || "unknown").trim().slice(0, 80);
    const locale = String(body?.locale || "en").trim().slice(0, 8);

    if (!question) {
      return NextResponse.json({ ok: false, error: "Ask a question first." }, { status: 400 });
    }

    const helpContext = await loadHelpContext();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        configured: false,
        answer: pickLocalFallbackAnswer(question, helpContext, locale),
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_HELP_MODEL || "gpt-5-mini",
        instructions:
          "You are the Gulera OS in-app help assistant. Answer using only the provided help files and conversation context. Be concise, practical, and honest. If the help files do not cover the answer, say that and suggest the closest place to check in the app. Do not invent app features. Answer in the requested locale when possible.",
        input: [
          {
            role: "developer",
            content: `Current page: ${page}\nRequested locale: ${locale}\n\nHelp files:\n${helpContext}`,
          },
          ...history.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: "user",
            content: question,
          },
        ],
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: data?.error?.message || "The AI helper could not answer right now.",
        },
        { status: 502 }
      );
    }

    const answer = extractOutputText(data);
    return NextResponse.json({
      ok: true,
      configured: true,
      answer: answer || "I could not find a clear answer in the help files.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "The AI helper could not answer right now.",
      },
      { status: 500 }
    );
  }
}
