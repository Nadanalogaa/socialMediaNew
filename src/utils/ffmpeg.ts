import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export const loadFFmpeg = async (): Promise<FFmpeg> => {
    if (ffmpeg) {
        return ffmpeg;
    }
    ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
    // Use a dynamic import for fetchFile to accommodate both browser and test environments.
    const { fetchFile } = await import('@ffmpeg/util');
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ffmpeg;
};

export const generateThumbnail = async (videoFile: File): Promise<File> => {
    const ffmpegInstance = await loadFFmpeg();
    const { fetchFile } = await import('@ffmpeg/util');
    const inputFileName = 'input.mp4'; // Use a generic name
    const outputFileName = 'output.jpg';

    await ffmpegInstance.writeFile(inputFileName, await fetchFile(videoFile));

    // Run command to extract a frame from the beginning of the video
    await ffmpegInstance.exec(['-i', inputFileName, '-ss', '00:00:01.000', '-vframes', '1', outputFileName]);

    const data = await ffmpegInstance.readFile(outputFileName);

    // Cleanup virtual files
    await ffmpegInstance.deleteFile(inputFileName);
    await ffmpegInstance.deleteFile(outputFileName);
    
    // The `readFile` method returns `FileData` (string | Uint8Array). We expect a `Uint8Array` for a binary
    // file. This type guard satisfies TypeScript and ensures we handle the correct data type.
    if (!(data instanceof Uint8Array)) {
        throw new Error('FFmpeg did not return a Uint8Array for the generated thumbnail.');
    }

    // The `data` is a Uint8Array. If it's backed by a SharedArrayBuffer (which can happen
    // with ffmpeg.wasm when using threading), the Blob constructor may not accept it directly.
    // Creating a new Uint8Array from it creates a copy with a standard ArrayBuffer,
    // ensuring compatibility.
    const thumbnailBlob = new Blob([new Uint8Array(data)], { type: 'image/jpeg' });
    return new File([thumbnailBlob], 'thumbnail.jpg', { type: 'image/jpeg' });
};