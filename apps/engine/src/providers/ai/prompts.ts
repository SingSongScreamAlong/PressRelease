/**
 * Prompt Templates for Article Generation
 * 
 * All prompts are centralized here for easy modification.
 * Safety guardrails are built into each prompt.
 */

export const SYSTEM_PROMPT = `You are an informational content writer. Your goal is to create helpful, accurate, and well-structured content that answers user questions.

CRITICAL RULES:
1. NEVER claim to be an expert, doctor, lawyer, financial advisor, or any professional.
2. NEVER give specific medical, legal, or financial advice.
3. ALWAYS use informational language like "generally", "typically", "according to official sources".
4. NEVER use words like "guaranteed", "always", "never", "definitely" for factual claims.
5. ALWAYS recommend consulting official sources or professionals for important decisions.
6. Include disclaimers when discussing health, legal, or financial topics.
7. Cite sources when making factual claims.

You write in a clear, helpful, and accessible style.`;

export const OUTLINE_PROMPT = (query: string, context?: string): string => `
Create a detailed article outline for the following search query:

Query: "${query}"
${context ? `\nContext/Category: ${context}` : ''}

Generate a structured outline with:
1. A compelling title (optimized for search)
2. A meta description (150-160 characters)
3. Main sections with H2 headings (at least 3)
4. Sub-sections with H3 headings where appropriate
5. Key points for each section
6. 3-5 FAQ questions that users often ask

Respond in JSON format:
{
  "title": "Article Title",
  "metaDescription": "Meta description here",
  "sections": [
    {
      "heading": "Section Heading",
      "level": "h2",
      "points": ["point 1", "point 2"]
    }
  ],
  "faqQuestions": ["Question 1?", "Question 2?"]
}
`;

export const ARTICLE_PROMPT = (
    query: string,
    outline: { title: string; sections: Array<{ heading: string; level: string; points: string[] }>; faqQuestions: string[] },
    category?: string
): string => `
Write a comprehensive informational article based on this outline:

Query: "${query}"
Title: "${outline.title}"
${category ? `Category: ${category}` : ''}

Outline:
${outline.sections.map(s => `${s.level.toUpperCase()}: ${s.heading}\n  - ${s.points.join('\n  - ')}`).join('\n\n')}

FAQ Questions to answer:
${outline.faqQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

REQUIREMENTS:
1. Start with a brief direct answer (2-4 sentences) immediately addressing the query.
2. Use the provided H2/H3 headings structure.
3. Include relevant statistics or facts where appropriate.
4. Add a "Frequently Asked Questions" section answering the provided questions.
5. End with a "Disclaimer" section appropriate to the topic.
6. End with a "Sources" section listing reference placeholders.

FORMAT:
- Use HTML headings: <h1>, <h2>, <h3>
- Use <p> for paragraphs
- Use <ul>/<li> for lists
- Use <strong> for emphasis

SAFETY REMINDERS:
- Use language like "generally", "typically", "according to policies"
- Include "verify with official sources" language
- Do not claim expertise or give professional advice
`;

export const FAQ_PROMPT = (questions: string[]): string => `
Answer each of these frequently asked questions in 2-3 sentences each.
Be helpful but remember to use cautious language and recommend official sources.

Questions:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Format your response as HTML with each Q&A:
<h3>Question here?</h3>
<p>Answer here...</p>
`;

export const GLOBAL_DISCLAIMER = `
<div class="disclaimer">
<h2>Disclaimer</h2>
<p>This article is for informational purposes only and should not be considered professional advice. 
The information provided may change over time and may not reflect the most current policies or regulations. 
Always consult official sources or qualified professionals for specific guidance related to your situation.</p>
</div>
`;

export const SOURCES_SECTION = (sources: string[]): string => {
    if (sources.length === 0) {
        return `
<div class="sources">
<h2>Sources</h2>
<p>Information in this article is based on publicly available resources. 
Please consult official sources for the most accurate and up-to-date information.</p>
</div>
`;
    }

    return `
<div class="sources">
<h2>Sources</h2>
<ul>
${sources.map(s => `<li>${s}</li>`).join('\n')}
</ul>
</div>
`;
};

export const BANNED_PHRASES = [
    'as an expert',
    'as a doctor',
    'as a lawyer',
    'as a financial advisor',
    'I am a professional',
    'guaranteed to',
    'will definitely',
    'always works',
    'never fails',
    'trust me',
    'take my word',
    'I promise',
    'you must',
    'you have to',
    'this is the only way',
];
