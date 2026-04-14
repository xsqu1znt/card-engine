import { createCanvas } from "@napi-rs/canvas";

export class CanvasUtils {
    static createTextBuffer(
        text: string,
        canvasWidth: number,
        canvasHeight: number,
        xPos: number,
        yPos: number,
        options: {
            font?: string;
            fontSize?: number;
            fontStyle?: string;
            fontWeight?: string;
            align?: "left" | "center" | "right";
            color?: string;
        } = {}
    ) {
        const { font, fontSize = 32, fontStyle, fontWeight, align = "left", color = "#000" } = options;

        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext("2d");

        const fontParts = [fontStyle, fontWeight, `${fontSize}px`, font].filter(Boolean).join(" ");
        ctx.font = fontParts;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(text, xPos, yPos, canvasWidth);

        return canvas.toBuffer("image/png");
    }
}
