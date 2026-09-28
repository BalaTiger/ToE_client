import { CARD_FACE_RATIO } from '../components/cards/CardFaceAssets';

export const CARD_PERSPECTIVE_RATIO = 8;
export const PILE_CARD_TILT = 45;

// A card on the shared table, measured in viewport pixels relative to the
// camera center. The homography keeps off-center piles under the same camera.
export function projectTableCard({ x, y, depth = 0, width, rotation = 0, tilt = PILE_CARD_TILT, perspective }) {
  const pitch = tilt * Math.PI / 180;
  const roll = rotation * Math.PI / 180;
  const sin = Math.sin(pitch), cos = Math.cos(pitch);
  const sr = Math.sin(roll), cr = Math.cos(roll);
  const denominator = perspective - sin * y - cos * depth;
  const px = perspective * x / denominator;
  const py = perspective * (cos * y - sin * depth) / denominator;
  return {
    x: px, y: py, width, height: width * CARD_FACE_RATIO, rotation, tilt,
    projection: {
      a: (perspective * cr + px * sin * sr) / denominator,
      b: (-perspective * sr + px * sin * cr) / denominator,
      c: -sin * sr / denominator,
      d: -sin * cr / denominator,
      e: (perspective * cos + py * sin) * sr / denominator,
      f: (perspective * cos + py * sin) * cr / denominator,
    },
  };
}
