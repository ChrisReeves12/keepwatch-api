import Mailgun from "mailgun.js";

/**
 * Create a visually appealing email template.
 * @param content
 */
function createEmailTemplate(content: string) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KeepWatch</title>
        <style></style>
    </head>
    <body>
        <div class="email-container">
            ${content}
        </div>
    </body>
    </html>
    `;
}

/**
 * Send email to recipients via Mailgun.
 * @param to
 * @param subject
 * @param content
 * @param from
 */
export async function sendEmail(to: string[], subject: string, content: string, from?: string) {
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({
        username: "api",
        key: process.env.MAILGUN_API_KEY as string
    });

    try {
        const htmlContent = createEmailTemplate(content);

        const data = await mg.messages.create(process.env.MAILGUN_DOMAIN as string, {
            from: from || process.env.MAILGUN_SENDER_EMAIL,
            to: to,
            subject: subject,
            html: htmlContent,
        });

        return { hasError: false, data };
    } catch (error: any) {
        console.error('An error occurred while sending email via Mailgun.', error);
        return { hasError: true, error }
    }
}
