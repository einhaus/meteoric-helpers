/* eslint-disable @typescript-eslint/naming-convention */
import { SendRawEmailCommand, SESClient, type SendRawEmailCommandInput } from '@aws-sdk/client-ses';
import * as fs from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';

export const sendEmailWithAttachment = async (config: {
    toEmail: string;
    fromEmail: string;
    subject: string;
    awsRegion: string;
    body?: string;
    attachmentPath?: string;
}) => {
    const { toEmail, fromEmail, subject, awsRegion, body = '', attachmentPath } = config;

    // Create the base64-encoded body for the plain text and HTML parts of the email
    const emailBody = `MIME-Version: 1.0
Subject: ${subject}
From: ${fromEmail}
To: ${toEmail}
Content-Type: multipart/mixed; boundary="NextPart"

--NextPart
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 7bit

${body}

`;

    let rawEmail = emailBody;

    // If an attachment is specified, add it to the email
    if (attachmentPath) {
        const attachment = fs.readFileSync(attachmentPath);
        const filename = path.basename(attachmentPath);
        const mimeType = mime.lookup(attachmentPath) || 'application/octet-stream';

        // Encode the attachment as base64
        const attachmentBase64 = attachment.toString('base64');

        // Add attachment to the raw email
        rawEmail += `
--NextPart
Content-Type: ${mimeType}; name="${filename}"
Content-Description: ${filename}
Content-Disposition: attachment; filename="${filename}"; size=${attachment.length};
Content-Transfer-Encoding: base64

${attachmentBase64}
`;
    }

    // End the MIME boundary
    rawEmail += '--NextPart--';

    // Create the SES sendRawEmailCommand parameters
    const params: SendRawEmailCommandInput = {
        RawMessage: {
            Data: Buffer.from(rawEmail)
        },
        Destinations: [toEmail],
        Source: fromEmail
    };

    try {
        const sesClient = new SESClient({ region: awsRegion });

        await sesClient.send(new SendRawEmailCommand(params));
    } catch (error) {
        console.error('Error sending email:', error);
    }
};
