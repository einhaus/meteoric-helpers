import fs from 'fs';
import { sendEmail } from './sendEmail.js';

export const sendEmailFromTemplate = async (config: {
    toEmail: string;
    awsRegion: string;
    firstName?: string;
    subject: string;
    templateName: string;
    templateDirectory: string;
    fromEmail: string;
    replyTo?: string;
    extraReplacements?: { macro: string; string: string }[];
}): Promise<void> => {
    const { toEmail, subject, templateName, firstName, extraReplacements, replyTo, templateDirectory, awsRegion, fromEmail } = config;
    const htmlTemplatePath = `${templateDirectory}${templateName}.html`;

    // The file doesn't exist
    if (!fs.existsSync(htmlTemplatePath)) throw new Error(`Email template ${templateName} not found`);

    if (!toEmail) throw new Error('No email address provided');

    // Import the email template
    let htmlBody = fs.readFileSync(htmlTemplatePath).toString();

    const textTemplatePath = `${templateDirectory}${templateName}.txt`;
    // Import the text template
    let plainTextBody = fs.existsSync(textTemplatePath) ? fs.readFileSync(textTemplatePath).toString() : '';

    // Populate the first name
    if (firstName) {
        htmlBody = htmlBody.replace('{{first_name}}', firstName);
        plainTextBody = plainTextBody.replace('{{first_name}}', firstName);
    }

    // Process any extra replacement macros
    if (extraReplacements) {
        for (const extraReplacement of extraReplacements) {
            if (!extraReplacement.macro || !extraReplacement.string) continue;

            // Replace the macro with the string
            htmlBody = htmlBody.replace(extraReplacement.macro, extraReplacement.string);
            plainTextBody = plainTextBody.replace(extraReplacement.macro, extraReplacement.string);
        }
    }

    // Send the email
    await sendEmail({
        toEmail,
        subject,
        body: htmlBody,
        replyTo: replyTo ? replyTo : fromEmail,
        fromEmail,
        awsRegion
    });
};
