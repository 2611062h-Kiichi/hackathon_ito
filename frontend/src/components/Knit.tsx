import Image from "next/image";
import { knitCaption, knitImage, knitItemFor, type KnitStage } from "@/lib/knit";

type Props = {
  sessionId: string;
  stage: KnitStage;
  size?: "sm" | "md" | "lg";
  showCaption?: boolean;
};

const WIDTH = { sm: 96, md: 192, lg: 288 };

export default function Knit({ sessionId, stage, size = "md", showCaption = false }: Props) {
  const item = knitItemFor(sessionId);
  const width = WIDTH[size];
  const caption = knitCaption(item, stage);
  return (
    <figure className="flex flex-col items-center">
      {/* key を変えて、段階が進んだときにふわっと切り替える */}
      <Image
        key={stage}
        src={knitImage(item, stage)}
        alt={caption}
        width={width}
        height={Math.round((width * 240) / 384)}
        className="animate-knit-in"
      />
      {showCaption && (
        <figcaption className="mt-1 text-sm font-bold text-navy/80">{caption}</figcaption>
      )}
    </figure>
  );
}
