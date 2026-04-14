import axios from "axios";
import { memory } from "qznt";

export type BunnyCDNRegion = "uk" | "ny" | "la" | "sg" | "se" | "br" | "jh" | "syd";

export interface BunnyCDNOptions {
    accessKey?: string;
    storageZone?: string;
    pullZone?: string;
    region?: BunnyCDNRegion;
}

export interface BunnyCDNUploadOptions {
    folder?: string;
    fileName?: string;
}

export interface BunnyCDN_Upload {
    success: boolean;
    name?: string;
    path?: string;
    size?: { bytes: number; str: string };
    cdnUrl?: string;
}

export class BunnyCDN {
    private static instance: BunnyCDN | null = null;
    private options: BunnyCDNOptions;

    private constructor(options: BunnyCDNOptions) {
        if (!options.accessKey) throw new Error("Missing BunnyCDN access key");
        if (!options.storageZone) throw new Error("Missing BunnyCDN storage zone");
        if (!options.pullZone) throw new Error("Missing BunnyCDN pull zone");

        this.options = options;
    }

    static use(): BunnyCDN {
        if (!BunnyCDN.instance) {
            BunnyCDN.instance = new BunnyCDN({
                accessKey: process.env.BUNNY_ACCESS_KEY,
                storageZone: process.env.BUNNY_STORAGE_ZONE,
                pullZone: process.env.BUNNY_PULL_ZONE,
                region: process.env.BUNNY_REGION as BunnyCDNRegion | undefined
            });
        }
        return BunnyCDN.instance;
    }

    private buildHeaders(headers?: Record<string, string>) {
        return { AccessKey: this.options.accessKey, ...headers };
    }

    private buildBaseUrl() {
        return `https://${this.options.region ? `${this.options.region}.` : ""}storage.bunnycdn.com/${this.options.storageZone}`;
    }

    private buildFileUrl(filename: string, folder?: string) {
        const baseUrl = this.buildBaseUrl();
        const nestedPath = folder ? `/${folder}` : "";
        return {
            uploadUrl: `${baseUrl}${nestedPath}/${filename}`,
            cdnUrl: `${this.options.pullZone}${nestedPath}/${filename}`,
            path: `${nestedPath}/${filename}`
        };
    }

    async uploadImageFromUrl(url: string, filename: string, folder?: string): Promise<BunnyCDN_Upload> {
        try {
            const res = await axios.get(url, { responseType: "arraybuffer" });
            if (!res.data) {
                console.error(`BunnyCDN: Failed to fetch image from URL: ${url}`);
                return { success: false };
            }

            return this.uploadFromBuffer(Buffer.from(res.data), filename, folder);
        } catch (err) {
            console.error(`BunnyCDN: Failed to fetch image from URL: ${url}`, err instanceof Error ? err.message : err);
            return { success: false };
        }
    }

    async uploadFromBuffer(buffer: Buffer, filename: string, folder?: string): Promise<BunnyCDN_Upload> {
        const fileUrl = this.buildFileUrl(filename, folder);

        try {
            const res = await axios.put(fileUrl.uploadUrl, buffer, {
                headers: this.buildHeaders({ "Content-Type": "application/octet-stream" })
            });

            if (res.status === 201) {
                return {
                    success: true,
                    name: filename,
                    path: fileUrl.path,
                    size: { bytes: buffer.length, str: memory(buffer.length) },
                    cdnUrl: fileUrl.cdnUrl
                };
            }

            console.error(`BunnyCDN: Failed to upload buffer, status code: ${res.status}`);
            return { success: false };
        } catch (err) {
            console.error(`BunnyCDN: Failed to upload buffer`, err instanceof Error ? err.message : err);
            return { success: false };
        }
    }

    async delete(path: string): Promise<boolean> {
        const baseUrl = this.buildBaseUrl();
        const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

        try {
            const res = await axios.delete(`${baseUrl}/${normalizedPath}`, { headers: this.buildHeaders() });
            if ([200, 204].includes(res.status)) return true;
            console.error(`BunnyCDN: Delete failed for ${path}, status code: ${res.status}`);
            return false;
        } catch (err) {
            console.error(`BunnyCDN: Delete failed for ${path}`, err instanceof Error ? err.message : err);
            return false;
        }
    }
}

export const useBunnyCDN = () => BunnyCDN.use();
