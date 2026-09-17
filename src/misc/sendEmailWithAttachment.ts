import { SendRawEmailCommand, SESClient, type SendRawEmailCommandInput, type SendRawEmailCommandOutput } from '@aws-sdk/client-ses';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as mime from 'mime-types';
import * as path from 'path';
import type { AwsCredentials } from '../file/S3Helper.js';

const BASE64_LINE_LENGTH = 76;

const wrapBase64 = (value: Buffer | string): string =>
    (Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'))
        .toString('base64')
        .replace(new RegExp(`(.{${BASE64_LINE_LENGTH}})`, 'g'), '$1\r\n')
        .replace(/\r\n$/, '');

const ENCODED_WORD_PREFIX = '=?UTF-8?B?';
const ENCODED_WORD_SUFFIX = '?=';
/** RFC 2047 limits an encoded-word to 75 characters and a header line containing one to 76. */
const MAX_ENCODED_WORD_LENGTH = 75;
const MAX_ENCODED_HEADER_LINE_LENGTH = 76;

const isPrintableAscii = (value: string): boolean => /^[\x20-\x7e]*$/.test(value);

/** Most UTF-8 bytes whose base64 encoded-word fits in `wordLength` characters. */
const maxEncodedWordBytes = (wordLength: number): number =>
    Math.floor((wordLength - ENCODED_WORD_PREFIX.length - ENCODED_WORD_SUFFIX.length) / 4) * 3;

/**
 * Formats a raw MIME header. Non-ASCII values become RFC 2047 encoded-words that each hold whole UTF-8 characters and fit
 * their header line, folded onto continuation lines with CRLF + space (decoders drop the whitespace between words).
 */
const formatHeader = (name: string, value: string): string => {
    if (isPrintableAscii(value)) return `${name}: ${value}`;

    const firstWordBytes = maxEncodedWordBytes(Math.min(MAX_ENCODED_WORD_LENGTH, MAX_ENCODED_HEADER_LINE_LENGTH - `${name}: `.length));
    const continuationWordBytes = maxEncodedWordBytes(Math.min(MAX_ENCODED_WORD_LENGTH, MAX_ENCODED_HEADER_LINE_LENGTH - 1));
    const words: string[] = [];
    let wordCharacters: Buffer[] = [];
    let wordByteLength = 0;

    const pushWord = () => {
        words.push(`${ENCODED_WORD_PREFIX}${Buffer.concat(wordCharacters).toString('base64')}${ENCODED_WORD_SUFFIX}`);
        wordCharacters = [];
        wordByteLength = 0;
    };

    // Iterating a string yields whole code points, so a multi-byte character is never split across words.
    for (const character of value) {
        const characterBytes = Buffer.from(character, 'utf8');
        const maxWordBytes = words.length === 0 ? firstWordBytes : continuationWordBytes;

        if (wordByteLength > 0 && wordByteLength + characterBytes.length > maxWordBytes) pushWord();

        wordCharacters.push(characterBytes);
        wordByteLength += characterBytes.length;
    }

    pushWord();

    return `${name}: ${words.join('\r\n ')}`;
};

/** RFC 2231 `attr-char` excludes these characters that `encodeURIComponent` leaves as-is. */
const encodeRfc2231Value = (value: string): string =>
    encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

/** A quoted parameter for ASCII file names; an RFC 2231 `name*=UTF-8''…` parameter for anything else. */
const formatFileNameParameter = (parameterName: 'name' | 'filename', fileName: string): string =>
    isPrintableAscii(fileName)
        ? `${parameterName}="${fileName.replace(/["\\]/g, '_')}"`
        : `${parameterName}*=UTF-8''${encodeRfc2231Value(fileName)}`;

/**
 * Sends an SES raw email with HTML, an optional plain-text alternative, and an optional file attachment.
 * Throws when the attachment cannot be read or SES rejects the message.
 */
export const sendEmailWithAttachment = async (config: {
    toEmail: string;
    fromEmail: string;
    subject: string;
    awsRegion: string;
    body?: string;
    /** Plain-text alternative for clients that do not render HTML. Omitted from the message when empty. */
    textBody?: string;
    attachmentPath?: string;
    replyTo?: string;
    credentials?: AwsCredentials;
}): Promise<void> => {
    const { toEmail, fromEmail, subject, awsRegion, body = '', textBody, attachmentPath, replyTo, credentials } = config;

    if (!toEmail.trim()) throw new Error(`sendEmailWithAttachment: missing recipient for "${subject}"`);

    const mixedBoundary = `mixed-${randomUUID()}`;
    const alternativeBoundary = `alternative-${randomUUID()}`;

    const bodyParts = [
        ...(textBody ? [{ contentType: 'text/plain', content: textBody }] : []),
        { contentType: 'text/html', content: body }
    ];

    const lines = [
        'MIME-Version: 1.0',
        formatHeader('Subject', subject),
        `From: ${fromEmail}`,
        `To: ${toEmail}`,
        ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
        `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
        '',
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        '',
        ...bodyParts.flatMap((part) => [
            `--${alternativeBoundary}`,
            `Content-Type: ${part.contentType}; charset="UTF-8"`,
            'Content-Transfer-Encoding: base64',
            '',
            wrapBase64(part.content),
            ''
        ]),
        `--${alternativeBoundary}--`,
        ''
    ];

    if (attachmentPath) {
        const attachment = fs.readFileSync(attachmentPath);
        const fileName = path.basename(attachmentPath);
        const mimeType = mime.lookup(attachmentPath) || 'application/octet-stream';

        lines.push(
            `--${mixedBoundary}`,
            `Content-Type: ${mimeType}; ${formatFileNameParameter('name', fileName)}`,
            `Content-Disposition: attachment; ${formatFileNameParameter('filename', fileName)}; size=${attachment.length}`,
            'Content-Transfer-Encoding: base64',
            '',
            wrapBase64(attachment),
            ''
        );
    }

    lines.push(`--${mixedBoundary}--`, '');

    const params: SendRawEmailCommandInput = {
        RawMessage: { Data: Buffer.from(lines.join('\r\n'), 'utf8') },
        Destinations: [toEmail],
        Source: fromEmail
    };

    const sesClient = new SESClient({ region: awsRegion, ...(credentials && { credentials }) });

    try {
        await sesClient.send<SendRawEmailCommandInput, SendRawEmailCommandOutput>(new SendRawEmailCommand(params));
    } finally {
        sesClient.destroy();
    }
};
