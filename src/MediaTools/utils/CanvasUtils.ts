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
            align?: "left" | "center" | "right";
            color?: string;
        } = {}
    ) {
        const { font, fontSize = 32, align = "left", color = "#000" } = options || {};
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext("2d");

        ctx.font = `${fontSize}px${font ? ` ${font}` : ""}`;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.fillText(text, xPos, yPos);

        return canvas.toBuffer("image/png");
    }
}

export default CanvasUtils;
