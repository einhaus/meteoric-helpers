/* eslint-disable @typescript-eslint/naming-convention */
import {
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectsCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    UploadPartCommand,
    AbortMultipartUploadCommand,
    type _Object,
    type CompletedPart,
    type CompleteMultipartUploadCommandInput,
    type DeleteObjectCommandInput,
    type DeleteObjectCommandOutput,
    type ListObjectsCommandInput,
    type ListObjectsV2CommandInput
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import child_process from 'child_process';
import fs from 'fs';
import { pipeline } from 'node:stream/promises';
import { msg } from '../misc/msg.js';
import path from 'path';
import { Readable } from 'stream';
import util from 'util';

const exec = util.promisify(child_process.exec);
export class S3Helper {
    private readonly s3: S3Client;
    private readonly bucketName: string;
    private readonly verbose: boolean;

    constructor(bucketName: string, region: string, verbose: boolean = false) {
        this.s3 = new S3Client({ region });
        this.bucketName = bucketName;
        this.verbose = verbose;
    }

    async listAllObjectsInBucket(prefix: string) {
        let isTruncated = true;
        const elements: _Object[] = [];
        let marker;

        const params: ListObjectsCommandInput = {
            Bucket: this.bucketName,
            Prefix: prefix
        };

        while (isTruncated) {
            try {
                if (marker) params.Marker = marker;
                const command = new ListObjectsCommand(params);
                const response = await this.s3.send(command);

                if (!response) isTruncated = false;
                if (!response) continue;

                response?.Contents?.forEach((item) => {
                    if (item) elements.push(item);
                });

                isTruncated = response.IsTruncated === undefined ? false : response.IsTruncated;
                if (isTruncated && response?.Contents?.slice(-1)?.[0]?.Key) marker = response?.Contents?.slice(-1)[0]?.Key;
            } catch (e: unknown) {
                console.error(e);
                return [];
            }
        }

        return elements;
    }

    async listFoldersInBucket() {
        const folders: string[] = [];

        let continuationToken: string | undefined = undefined;
        let isTruncated = true;

        while (isTruncated) {
            const params: ListObjectsV2CommandInput = {
                Bucket: this.bucketName,
                Delimiter: '/',
                ContinuationToken: continuationToken
            };

            const command = new ListObjectsV2Command(params);

            const response = await this.s3.send(command);

            // CommonPrefixes contains the "directories"
            if (response.CommonPrefixes) {
                for (const prefix of response.CommonPrefixes) {
                    if (prefix.Prefix) {
                        folders.push(prefix.Prefix);
                    }
                }
            }

            isTruncated = response.IsTruncated ?? false;
            continuationToken = response.NextContinuationToken;
        }

        return folders;
    }

    async downloadObject(key: string, filePath: string) {
        if (!key) return msg('No key provided');
        const filename = path.basename(key);

        try {
            const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
            const { Body } = await this.s3.send(command);

            await pipeline(Body as Readable, fs.createWriteStream(`${filePath}${filename}`));
        } catch (e: unknown) {
            console.error(e);
        }
    }

    async getObjectStream(key: string): Promise<Readable> {
        if (!key) throw new Error('No key provided');

        const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
        const { Body } = await this.s3.send(command);

        if (!Body || !(Body instanceof Readable)) {
            throw new Error(`No readable body returned for key: ${key}`);
        }

        return Body;
    }

    async deleteObjectByKey(folder: string, filename: string) {
        try {
            const command = new DeleteObjectCommand({ Bucket: this.bucketName, Key: `${folder}/${filename}` });
            await this.s3.send(command);
        } catch (e: unknown) {
            console.error(e);
        }
    }

    async uploadFile(config: { filePath: string; key: string; deleteAfterUpload?: boolean }) {
        const { filePath, key, deleteAfterUpload = false } = config;

        try {
            // Get file stats to check size
            const stats = fs.statSync(filePath);
            const fileSizeInBytes = stats.size;

            // If file is larger than 1mb, use multipart upload
            const ONE_MB = 1 * 1024 * 1024; // 1MB in bytes

            if (fileSizeInBytes > ONE_MB) {
                if (this.verbose) console.log(`File size ${fileSizeInBytes} bytes exceeds 1MB, using multipart upload`);
                return await this.uploadFileMultipart(config);
            }

            // For smaller files, use regular upload
            const uploadParams = {
                Bucket: this.bucketName,
                Key: key,
                Body: fs.createReadStream(filePath)
            };

            const command = new PutObjectCommand(uploadParams);
            const result = await this.s3.send(command);
            if (this.verbose) console.log(result);

            if (deleteAfterUpload) {
                if (this.verbose) console.log(`Deleting ${filePath}`);
                await exec(`rm -rf ${filePath}`);
            }
        } catch (e: unknown) {
            console.error(e);
        }
    }

    async uploadFileMultipart(config: { filePath: string; key: string; deleteAfterUpload?: boolean }) {
        const { filePath, key, deleteAfterUpload = false } = config;

        const uploadParams = {
            Bucket: this.bucketName,
            Key: key
        };

        let uploadId: string | undefined;

        try {
            // Step 1: Create multipart upload
            const command = new CreateMultipartUploadCommand(uploadParams);
            const result = await this.s3.send(command);

            if (!result.UploadId) throw new Error('UploadId is undefined');
            uploadId = result.UploadId;

            if (this.verbose) console.log(`Started multipart upload for ${key} with UploadId: ${uploadId}`);

            // Step 2: Upload parts
            const completedParts = await this.uploadFileInChunks({ filePath, key, uploadId });

            if (this.verbose) console.log(`Successfully uploaded ${completedParts.length} parts for ${key}`);

            // Step 3: Complete multipart upload
            const s3ParamsComplete: CompleteMultipartUploadCommandInput = {
                ...uploadParams,
                ...{
                    UploadId: uploadId,
                    MultipartUpload: {
                        Parts: completedParts
                    }
                }
            };

            const completeCommand = new CompleteMultipartUploadCommand(s3ParamsComplete);
            await this.s3.send(completeCommand);

            if (this.verbose) console.log(`Completed multipart upload for ${key}`);

            if (deleteAfterUpload) {
                if (this.verbose) console.log(`Deleting ${filePath}`);
                await exec(`rm -rf ${filePath}`);
            }
        } catch (e: unknown) {
            console.error(e);

            // If we have an uploadId, we should try to abort the multipart upload
            if (uploadId) {
                try {
                    const abortCommand = new AbortMultipartUploadCommand({
                        Bucket: this.bucketName,
                        Key: key,
                        UploadId: uploadId
                    });

                    await this.s3.send(abortCommand);
                    if (this.verbose) console.log(`Aborted multipart upload for ${key} with UploadId: ${uploadId}`);
                } catch (abortError) {
                    console.error(abortError);
                }
            }
        }
    }

    private async uploadFileInChunks(config: { filePath: string; key: string; uploadId: string }) {
        const { filePath, key, uploadId } = config;
        const completedParts: CompletedPart[] = [];
        const ONE_HUNDRED_MB_IN_BYTES = 100 * 1024 * 1024;

        // Get file size for better tracking
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // Create a read stream but don't attach event handlers yet
        const fileStream = fs.createReadStream(filePath, {
            highWaterMark: ONE_HUNDRED_MB_IN_BYTES
        });

        return new Promise<CompletedPart[]>(async (resolve, reject) => {
            try {
                let partNumber = 1;
                let bytesProcessed = 0;

                // Manual chunk reading to ensure proper sequencing
                const chunks: Buffer[] = [];

                // Collect all chunks first
                for await (const chunk of fileStream) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }

                // Then process them sequentially
                for (const chunk of chunks) {
                    if (this.verbose) console.log(`Uploading part ${partNumber} (${chunk.length} bytes)`);

                    let uploadSuccessful = false;
                    let retries = 0;
                    const MAX_RETRIES = 3;

                    while (!uploadSuccessful && retries < MAX_RETRIES) {
                        try {
                            const result = await this.uploadFilePart(chunk, key, uploadId, partNumber);

                            if (result.ETag) {
                                completedParts.push({
                                    PartNumber: result.partNumber,
                                    ETag: result.ETag
                                });

                                bytesProcessed += chunk.length;

                                // eslint-disable-next-line max-depth
                                if (this.verbose) {
                                    const percentComplete = ((bytesProcessed / fileSize) * 100).toFixed(2);

                                    console.log(
                                        `Part ${partNumber} uploaded successfully.
                                         Progress: ${percentComplete}% (${bytesProcessed}/${fileSize} bytes)`
                                    );
                                }

                                uploadSuccessful = true;
                            } else {
                                retries++;
                                // eslint-disable-next-line max-depth
                                if (this.verbose) console.log(`Retrying part ${partNumber} (attempt ${retries}/${MAX_RETRIES})`);
                            }
                        } catch (error) {
                            retries++;
                            if (this.verbose) console.log(`Error uploading part ${partNumber} (attempt ${retries}/${MAX_RETRIES}):`, error);

                            if (retries >= MAX_RETRIES) {
                                throw error;
                            }

                            // Wait before retrying
                            const currentRetryCount = retries; // Capture the current value to avoid closure issues
                            await new Promise((res) => setTimeout(res, 1000 * currentRetryCount));
                        }
                    }

                    if (!uploadSuccessful) {
                        throw new Error(`Failed to upload part ${partNumber} after ${MAX_RETRIES} attempts`);
                    }

                    partNumber++;
                }

                if (completedParts.length > 0) {
                    if (this.verbose) console.log(`All parts uploaded successfully. Total: ${completedParts.length} parts`);
                    resolve(completedParts);
                } else {
                    reject(new Error('No parts were uploaded successfully'));
                }
            } catch (error) {
                console.error(error);
                reject(error);
            }
        });
    }

    private async uploadFilePart(body: string | Buffer, key: string, uploadId: string, partNumber: number) {
        const partParams = {
            Key: key,
            Bucket: this.bucketName,
            Body: body,
            UploadId: uploadId,
            PartNumber: partNumber
        };

        try {
            const part = await this.s3.send(new UploadPartCommand(partParams));

            if (!part.ETag) {
                throw new Error(`No ETag returned for part ${partNumber}`);
            }

            if (this.verbose) {
                console.log(`Successfully uploaded part ${partNumber} with ETag: ${part.ETag}`);
            }

            return { partNumber, ETag: part.ETag };
        } catch (error) {
            console.error(error);
            return { partNumber, ETag: undefined };
        }
    }

    async deleteObjects(objectList: _Object[]) {
        for (const object of objectList) {
            await this.deleteObject(object);
        }
    }

    async deleteObject(object: _Object) {
        try {
            const command = new DeleteObjectCommand({ Bucket: this.bucketName, Key: object.Key });
            await this.s3.send<DeleteObjectCommandInput, DeleteObjectCommandOutput>(command);
        } catch (e: unknown) {
            console.error(e);
        }
    }

    /**
     * Generate a pre-signed URL for downloading an object
     * @param key The S3 object key
     * @param expiresIn Expiration time in seconds (default: 3600)
     * @param options Additional options for the download
     */
    async getPresignedDownloadUrl(
        key: string,
        expiresIn: number = 3600,
        options?: {
            responseContentDisposition?: string;
            responseContentType?: string;
        }
    ): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            ResponseContentDisposition: options?.responseContentDisposition,
            ResponseContentType: options?.responseContentType
        });

        try {
            const url = await getSignedUrl(this.s3, command, { expiresIn });
            return url;
        } catch (error) {
            console.error(`Failed to generate pre-signed URL for key ${key}:`, error);
            throw error;
        }
    }

    /**
     * Generate a pre-signed URL for viewing an object inline
     * @param key The S3 object key
     * @param filename The filename to use in the Content-Disposition header
     * @param expiresIn Expiration time in seconds (default: 3600)
     */
    async getPresignedViewUrl(
        key: string,
        filename: string,
        expiresIn: number = 3600
    ): Promise<string> {
        return this.getPresignedDownloadUrl(key, expiresIn, {
            responseContentDisposition: `inline; filename="${filename}"`
        });
    }

    /**
     * Generate a pre-signed URL for downloading an object as attachment
     * @param key The S3 object key
     * @param filename The filename to use for download
     * @param expiresIn Expiration time in seconds (default: 3600)
     */
    async getPresignedAttachmentUrl(
        key: string,
        filename: string,
        expiresIn: number = 3600
    ): Promise<string> {
        return this.getPresignedDownloadUrl(key, expiresIn, {
            responseContentDisposition: `attachment; filename="${filename}"`
        });
    }
}
