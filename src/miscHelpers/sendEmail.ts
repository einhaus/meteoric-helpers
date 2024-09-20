/* eslint-disable @typescript-eslint/naming-convention */
import { SendEmailCommand, SESClient, type SendEmailCommandInput, type SendEmailCommandOutput } from '@aws-sdk/client-ses';

export const sendEmail = async (config: { toEmail: string; fromEmail: string; awsRegion: string; subject: string; body?: string }) => {
    const { toEmail, subject, fromEmail, awsRegion, body = '' } = config;

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
                Text: {
                    Charset: 'UTF-8',
                    Data: ''
                }
            },
            Subject: {
                Charset: 'UTF-8',
                Data: subject
            }
        },
        Source: fromEmail,
        ReplyToAddresses: []
    };

    const sendEmailCommand = new SendEmailCommand(params);

    const sesClient = new SESClient({ region: awsRegion });

    try {
        await sesClient.send<SendEmailCommandInput, SendEmailCommandOutput>(sendEmailCommand);
    } catch (e) {
        console.error(e);
    }
};
