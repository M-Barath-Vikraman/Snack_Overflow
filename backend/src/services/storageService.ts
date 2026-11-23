import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorMiddleware';

export interface StorageUploadResult {
  publicUrl: string;
  storagePath: string;
}

export interface StorageProvider {
  upload(
    storagePath: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<StorageUploadResult>;
  delete(storagePath: string): Promise<void>;
  getPublicUrl(storagePath: string): string;
}

/**
 * Default live Supabase Storage provider using @supabase/supabase-js
 */
class SupabaseStorageProvider implements StorageProvider {
  private client: SupabaseClient | null = null;

  private getClient(): SupabaseClient {
    if (!this.client) {
      if (!config.supabaseUrl || !config.supabaseSecretKey) {
        throw new AppError(
          'Supabase storage is not configured. Missing SUPABASE_URL or SUPABASE_SECRET_KEY.',
          500,
          'STORAGE_NOT_CONFIGURED'
        );
      }
      this.client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
    return this.client;
  }

  public async upload(
    storagePath: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<StorageUploadResult> {
    const supabase = this.getClient();
    const bucket = config.supabaseStorageBucket;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error('Supabase storage upload error:', uploadError.message);
      throw new AppError(
        `Failed to upload image to storage: ${uploadError.message}`,
        502,
        'STORAGE_UPLOAD_ERROR'
      );
    }

    const publicUrl = this.getPublicUrl(storagePath);

    return {
      publicUrl,
      storagePath,
    };
  }

  public async delete(storagePath: string): Promise<void> {
    const supabase = this.getClient();
    const bucket = config.supabaseStorageBucket;

    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([storagePath]);

    if (deleteError) {
      logger.error('Supabase storage delete error:', deleteError.message);
      throw new AppError(
        `Failed to delete image from storage: ${deleteError.message}`,
        502,
        'STORAGE_DELETE_ERROR'
      );
    }
  }

  public getPublicUrl(storagePath: string): string {
    const supabase = this.getClient();
    const bucket = config.supabaseStorageBucket;

    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return data.publicUrl;
  }
}

const GLOBAL_STORAGE_PROVIDER_KEY = Symbol.for('snack_overflow_storage_provider');

export class StorageService {
  private provider: StorageProvider;
  private defaultProvider: StorageProvider;

  constructor() {
    this.defaultProvider = new SupabaseStorageProvider();
    this.provider = this.defaultProvider;
  }

  /**
   * Set custom/mock storage provider (primarily for isolated test environments).
   */
  public setProvider(provider: StorageProvider): void {
    (globalThis as any)[GLOBAL_STORAGE_PROVIDER_KEY] = provider;
    this.provider = provider;
  }

  /**
   * Reset to the default Supabase storage provider.
   */
  public resetProvider(): void {
    delete (globalThis as any)[GLOBAL_STORAGE_PROVIDER_KEY];
    this.provider = this.defaultProvider;
  }

  public getProvider(): StorageProvider {
    return (globalThis as any)[GLOBAL_STORAGE_PROVIDER_KEY] || this.provider;
  }

  /**
   * Generates a unique, sanitized storage path for a snack image.
   * Format: snacks/<snackId>/<timestamp>-<randomHex>.<extension>
   */
  public generateStoragePath(snackId: string, extension: string): string {
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const timestamp = Date.now();
    return `snacks/${snackId}/${timestamp}-${randomSuffix}.${extension}`;
  }

  /**
   * Uploads an image file buffer to the configured storage bucket.
   */
  public async uploadSnackImage(
    snackId: string,
    fileBuffer: Buffer,
    extension: string,
    mimeType: string
  ): Promise<StorageUploadResult> {
    const storagePath = this.generateStoragePath(snackId, extension);
    return this.getProvider().upload(storagePath, fileBuffer, mimeType);
  }

  /**
   * Safely deletes an existing object from the storage bucket.
   */
  public async deleteSnackImage(storagePath: string): Promise<void> {
    if (!storagePath) return;
    try {
      await this.getProvider().delete(storagePath);
    } catch (err: any) {
      // Log warning for orphaned cleanup failures without crashing caller
      logger.warn(`Failed to delete storage path ${storagePath}: ${err.message}`);
    }
  }
}

export const storageService = new StorageService();
