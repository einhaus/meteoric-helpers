import { SendEmailCommand, SESClient, type SendEmailCommandInput, type SendEmailCommandOutput } from '@aws-sdk/client-ses';
import type { AwsCredentials } from '../file/S3Helper.js';

export const sendEmail = async (config: {
    toEmail: string;
    fromEmail: string;
    awsRegion: string;
    subject: string;
    body?: string;
    /** Plain-text alternative for clients that do not render HTML. Omitted from the message when empty. */
    textBody?: string;
    replyTo?: string;
    credentials?: AwsCredentials;
}) => {
    const { toEmail, subject, fromEmail, awsRegion, replyTo, body = '', textBody, credentials } = config;

    const replyToAddresses = replyTo ? [replyTo] : [];

    const params = {
        Destination: {
            CcAddresses: [],
            ToAddresses: [toEmail]
        },
        Message: {
            Body: {
                Html: {
                    Charset: 'UTF-8',
                    Data: body
                },
                ...(textBody
                    ? {
                          Text: {
                              Charset: 'UTF-8',
                              Data: textBody
                          }
                      }
                    : {})
            },
            Subject: {
                Charset: 'UTF-8',
                Data: subject
            }
        },
        Source: fromEmail,
        ReplyToAddresses: replyToAddresses
    };

    const sendEmailCommand = new SendEmailCommand(params);

    const sesClient = new SESClient({ region: awsRegion, ...(credentials && { credentials }) });

    try {
        await sesClient.send<SendEmailCommandInput, SendEmailCommandOutput>(sendEmailCommand);
    } finally {
        sesClient.destroy();
    }
};
