"use client";

import React, { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from "framer-motion";
import { cn } from "@/lib/utils";

export const LilCometCardBright = ({
  rotateDepth = 2.5,
  translateDepth = 2.5,
  className,
  children,
}: {
  rotateDepth?: number;
  translateDepth?: number;
  className?: string;
  children: React.ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x, { stiffness: 220, damping: 22 });
  const mouseYSpring = useSpring(y, { stiffness: 220, damping: 22 });

  const rotateX = useTransform(
    mouseYSpring,
    [-0.5, 0.5],
    [`-${rotateDepth}deg`, `${rotateDepth}deg`],
  );
  const rotateY = useTransform(
    mouseXSpring,
    [-0.5, 0.5],
    [`${rotateDepth}deg`, `-${rotateDepth}deg`],
  );

  const translateX = useTransform(
    mouseXSpring,
    [-0.5, 0.5],
    [`-${translateDepth}px`, `${translateDepth}px`],
  );
  const translateY = useTransform(
    mouseYSpring,
    [-0.5, 0.5],
    [`${translateDepth}px`, `-${translateDepth}px`],
  );

  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], [0, 100]);

  const glareBackground = useMotionTemplate`
    radial-gradient(
      circle at ${glareX}% ${glareY}%,
      rgba(255, 255, 255, 0.9) 10%,
      rgba(255, 255, 255, 0.75) 20%,
      rgba(255, 255, 255, 0) 80%
    )
  `;

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xPct = mouseX / rect.width - 0.5;
    const yPct = mouseY / rect.height - 0.5;

    x.set(xPct);
    y.set(yPct);
  };

  return (
    <div className={cn("perspective-distant transform-3d", className)}>
      <motion.div
        ref={ref}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          reset();
        }}
        onMouseMove={handleMouseMove}
        style={
          hovered
            ? { rotateX, rotateY, translateX, translateY }
            : undefined
        }
        animate={hovered ? { scale: 1.05, z: 20 } : { scale: 1, z: 0 }}
        transition={{ duration: 0.18 }}
        className="relative rounded-2xl"
      >
        {children}

        {/* Glare uniquement pendant le hover */}
        <motion.div
          className="pointer-events-none absolute inset-0 z-20 h-full w-full rounded-[16px] mix-blend-overlay"
          style={{ background: glareBackground }}
          animate={{ opacity: hovered ? 0.65 : 0 }}
          transition={{ duration: 0.18 }}
        />
      </motion.div>
    </div>
  );
};