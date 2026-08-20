import { beforeEach, describe, expect, test, vi } from 'vitest';

const { destroyMock, sendMock } = vi.hoisted(() => ({
    destroyMock: vi.fn(),
    sendMock: vi.fn()
}));

vi.mock('@aws-sdk/client-ses', () => ({
    SendEmailCommand: class SendEmailCommand {
        constructor(readonly input: unknown) {}
    },
    SESClient: class SESClient {
        destroy = destroyMock;
        send = sendMock;
    }
}));

import { sendEmail } from '../../src/misc/sendEmail.js';

const config = {
    awsRegion: 'us-west-2',
    fromEmail: 'support@example.com',
    subject: 'Test message',
    toEmail: 'recipient@example.com'
};

describe('sendEmail', () => {
    beforeEach(() => {
        destroyMock.mockReset();
        sendMock.mockReset();
    });

    test('resolves after SES accepts the message and destroys the client', async () => {
        sendMock.mockResolvedValue({ MessageId: 'test-message-id' });

        await expect(sendEmail(config)).resolves.toBeUndefined();
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(destroyMock).toHaveBeenCalledTimes(1);
    });

    test('rejects when SES fails and still destroys the client', async () => {
        const error = new Error('SES rejected the message');
        sendMock.mockRejectedValue(error);

        await expect(sendEmail(config)).rejects.toBe(error);
        expect(destroyMock).toHaveBeenCalledTimes(1);
    });
});
