import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Allow long-running GPU operations

export async function POST(req: NextRequest) {
  try {
    const { image, scale = 4, face_enhance = false, remove_bg = false, model = "x4plus" } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const apiKey = process.env.RUNPOD_API_KEY;
    const endpointId = process.env.RUNPOD_ENDPOINT_ID || "3j67gpfsvuwgy3";

    if (!apiKey) {
      return NextResponse.json({ error: "Server missing RUNPOD_API_KEY" }, { status: 500 });
    }

    // Call RunPod Serverless runsync
    const url = `https://api.runpod.ai/v2/${endpointId}/runsync`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: {
          image,
          scale: Number(scale),
          face_enhance: Boolean(face_enhance),
          remove_bg: Boolean(remove_bg),
          model,
          image_format: "jpg",
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `RunPod API error: ${errText}` }, { status: response.status });
    }

    const data = await response.json();

    if (data.status === "COMPLETED" && data.output) {
      if (data.output.error) {
        return NextResponse.json({ error: data.output.error }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        image: data.output.image,
        width: data.output.width,
        height: data.output.height,
        fileSize: data.output.fileSize,
      });
    }

    return NextResponse.json({ error: data.status || "Failed to process image" }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
