import type { SendRawEmailCommandInput } from '@aws-sdk/client-ses';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { destroyMock, sendMock } = vi.hoisted(() => ({
    destroyMock: vi.fn(),
    sendMock: vi.fn()
}));

vi.mock('@aws-sdk/client-ses', () => ({
    SendRawEmailCommand: class SendRawEmailCommand {
        constructor(readonly input: unknown) {}
    },
    SESClient: class SESClient {
        destroy = destroyMock;
        send = sendMock;
    }
}));

import { sendEmailWithAttachment } from '../../src/misc/sendEmailWithAttachment.js';

const decodeRawMessage = (): string => {
    const [command] = sendMock.mock.calls[0] as [{ input: SendRawEmailCommandInput }];
    const data = command.input.RawMessage?.Data;

    if (!data) throw new Error('Missing raw message');

    return Buffer.from(data).toString('utf8');
};

const decodeBase64Parts = (raw: string): string[] =>
    [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n\r\n--/g)].map((match) =>
        Buffer.from((match[1] ?? '').replace(/\r\n/g, ''), 'base64').toString('utf8')
    );

describe('sendEmailWithAttachment', () => {
    let directory: string;

    beforeEach(() => {
        destroyMock.mockReset();
        sendMock.mockReset();
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'send-email-attachment-'));
    });

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true });
    });

    test('sends text and HTML alternatives with a UTF-8 subject and a base64 attachment', async () => {
        sendMock.mockResolvedValue({ MessageId: 'id' });
        const attachmentPath = path.join(directory, 'report.csv');
        fs.writeFileSync(attachmentPath, 'Symbol,ARORC\nARKG,41.2\n');

        await sendEmailWithAttachment({
            toEmail: 'recipient@example.com',
            fromEmail: 'no-reply@example.com',
            awsRegion: 'us-east-1',
            subject: 'Puts report · 12 contracts',
            body: '<p>Report − ready</p>',
            textBody: 'Report − ready',
            attachmentPath
        });

        const raw = decodeRawMessage();

        expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from('Puts report · 12 contracts').toString('base64')}?=`);
        expect(raw).toMatch(/Content-Type: multipart\/alternative; boundary="alternative-/);
        expect(raw.indexOf('Content-Type: text/plain')).toBeLessThan(raw.indexOf('Content-Type: text/html'));
        expect(raw).toContain('Content-Disposition: attachment; filename="report.csv"');
        expect(decodeBase64Parts(raw)).toEqual(['Report − ready', '<p>Report − ready</p>', 'Symbol,ARORC\nARKG,41.2\n']);
        expect(destroyMock).toHaveBeenCalledOnce();
    });

    test('splits a long non-ASCII subject into folded encoded-words that decode back exactly', async () => {
        sendMock.mockResolvedValue({ MessageId: 'id' });
        const subject = `High ARORC puts report · 1,284 puts across 312 stocks · Incomplete — 12 stocks missing 📉 · Übersicht für André`;

        await sendEmailWithAttachment({
            toEmail: 'recipient@example.com',
            fromEmail: 'no-reply@example.com',
            awsRegion: 'us-east-1',
            subject,
            body: '<p>Report</p>'
        });

        const raw = decodeRawMessage();
        const subjectHeader = raw.match(/^Subject: .*(?:\r\n .*)*/m)?.[0];

        if (!subjectHeader) throw new Error('Missing Subject header');

        const headerLines = subjectHeader.split('\r\n');
        const words = subjectHeader.replace(/^Subject: /, '').split('\r\n ');

        expect(words.length).toBeGreaterThan(1);
        expect(headerLines.slice(1).every((line) => line.startsWith(' '))).toBe(true);
        expect(Math.max(...headerLines.map((line) => line.length))).toBeLessThanOrEqual(76);

        for (const word of words) {
            expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
            expect(word.length).toBeLessThanOrEqual(75);
        }

        // Each word must hold whole characters, so decoding words one at a time reproduces the subject.
        const decoded = words.map((word) => Buffer.from(word.slice('=?UTF-8?B?'.length, -'?='.length), 'base64').toString('utf8')).join('');

        expect(decoded).toBe(subject);
        expect(decoded).not.toContain('�');
    });

    test('encodes a non-ASCII attachment file name with RFC 2231 parameters', async () => {
        sendMock.mockResolvedValue({ MessageId: 'id' });
        const fileName = "Übersicht (André's) 2026.csv";
        const attachmentPath = path.join(directory, fileName);
        fs.writeFileSync(attachmentPath, 'Symbol\n');

        await sendEmailWithAttachment({
            toEmail: 'recipient@example.com',
            fromEmail: 'no-reply@example.com',
            awsRegion: 'us-east-1',
            subject: 'Report',
            attachmentPath
        });

        const raw = decodeRawMessage();
        const encodedFileName = '%C3%9Cbersicht%20%28Andr%C3%A9%27s%29%202026.csv';

        expect(raw).toContain(`Content-Type: text/csv; name*=UTF-8''${encodedFileName}`);
        expect(raw).toContain(`Content-Disposition: attachment; filename*=UTF-8''${encodedFileName}; size=7`);
        expect(decodeURIComponent(encodedFileName)).toBe(fileName);
        expect(raw).not.toContain('filename="');
    });

    test('rejects when SES fails instead of swallowing the error', async () => {
        const error = new Error('SES rejected the message');
        sendMock.mockRejectedValue(error);

        await expect(
            sendEmailWithAttachment({
                toEmail: 'recipient@example.com',
                fromEmail: 'no-reply@example.com',
                awsRegion: 'us-east-1',
                subject: 'Report'
            })
        ).rejects.toBe(error);
        expect(destroyMock).toHaveBeenCalledOnce();
    });

    test('rejects a missing recipient before calling SES', async () => {
        await expect(
            sendEmailWithAttachment({ toEmail: ' ', fromEmail: 'no-reply@example.com', awsRegion: 'us-east-1', subject: 'Report' })
        ).rejects.toThrow('missing recipient');
        expect(sendMock).not.toHaveBeenCalled();
    });
});
