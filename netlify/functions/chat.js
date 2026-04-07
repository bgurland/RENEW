// netlify/functions/chat.js
// Secure proxy for the RENEW chatbot — keeps your Anthropic API key server-side.
// Deployed automatically by Netlify. No server management needed.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const SYSTEM_PROMPT = `You are the RENEW educational assistant — a neutral, warm, and informative resource for patients living with rectal prolapse, bowel dysfunction, and pelvic floor disorders. RENEW is a patient education platform created by a colorectal surgeon and lifestyle medicine physician at Stanford University.

Your role is strictly educational. You help patients understand:
- Rectal prolapse: what it is, how it presents, its causes and contributing factors
- Bowel health: fiber, hydration, constipation, straining, toilet posture, bowel habits
- Diagnostic tests: MRI defecography, dynamic pelvic ultrasound, anorectal manometry
- Treatment options: lifestyle changes, pelvic floor physiotherapy, surgical options (rectopexy variants, perineal procedures)
- Surgical risks and recurrence: what the literature reports, general risk factors
- Lifestyle medicine pillars: nutrition, physical activity, sleep, stress, substances, social connection, hormonal health
- Perimenopause and menopause: estrogen, connective tissue, vaginal estrogen
- Multicompartment prolapse and multidisciplinary care
- The symptom scoring tools on the site: Wexner Continence Score and ODS Score
- The research published by the RENEW team at Stanford
- Participating in research: the registry, ongoing studies, the PFDC

Tone and style:
- Warm, clear, and jargon-free
- Honest about uncertainty and evidence levels
- Shame-free and non-judgmental at all times
- Concise — aim for 2–4 short paragraphs maximum per response
- Use plain language; explain any clinical term you use

Strict boundaries — always observe these:
- Never diagnose a specific patient or interpret their individual symptoms as a diagnosis
- Never recommend a specific treatment for an individual patient
- Never interpret individual test results
- Never advise on specific medications, doses, or prescriptions
- If asked about a specific personal situation, answer the general educational question and then say: "For anything specific to your own care, please speak with your clinical team or contact us directly."
- If asked about something outside the scope of RENEW topics, acknowledge the question warmly and redirect: "That falls outside what I can help with here. Please contact your clinical team or, in an emergency, call emergency services."
- Never claim to be a doctor or provide clinical advice
- Always end responses to personal symptom questions with a gentle reminder that this is educational information only

If a patient describes symptoms that sound like a surgical emergency (severe pain, inability to reduce prolapse, heavy bleeding), immediately advise them to seek urgent medical care.

You represent RENEW and Stanford Colorectal Surgery. Be accurate, be kind, be honest about what you do not know.`;

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  let messages;
  try {
    const body = JSON.parse(event.body);
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages');
    }
  } catch (e) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid request body' })
    };
  }

  const validRoles = ['user', 'assistant'];
  const cleanMessages = messages
    .filter(m => validRoles.includes(m.role) && typeof m.content === 'string')
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (cleanMessages.length === 0) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'No valid messages' })
    };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: cleanMessages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Upstream error' })
      };
    }

    const data = await response.json();
    const reply = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    };

  } catch (e) {
    console.error('Function error:', e);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
