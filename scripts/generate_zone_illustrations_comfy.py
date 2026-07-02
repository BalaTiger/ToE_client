from __future__ import annotations

import argparse
import io
import json
import random
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib import error, parse, request

from PIL import Image, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "asset_sources" / "card_illustration_png"
COMFY = "http://127.0.0.1:8188"

LANDSCAPE_SOURCE_SIZE = (1448, 1086)
PORTRAIT_SOURCE_SIZE = (1086, 1448)
LANDSCAPE_LATENT_SIZE = (1024, 768)
PORTRAIT_LATENT_SIZE = (768, 1024)

STYLE_PROMPT = (
    "edge-to-edge full-canvas photoreal dark fantasy concept scene, "
    "physically realistic wet stone, mud, mineral sheen, smoky torchlight, "
    "selective green or cold blue practical glow, natural skin and fabric, film grain, "
    "deep black shadows, cinematic lighting, dramatic chiaroscuro, high-end creature-feature production art, "
    "readable central subject, crop-safe composition, single uninterrupted scene filling the whole image"
)

AVOID_PROMPT = (
    "cartoon, anime, comic book, manga, cel shading, clean vector art, flat colors, stylized mobile game art, "
    "plastic toy look, cute, chibi, white border, rounded border, black border, empty margin, framed picture, "
    "printed photograph, picture on white paper, white mat, drop shadow, letterbox bars, black bars, "
    "text, letters, captions, logo, watermark, title banner, UI, modern poster layout, bright daylight, "
    "no explicit gore, no graphic wounds"
)


@dataclass(frozen=True)
class CardArtSpec:
    name: str
    slug: str
    prompt: str
    portrait: bool = False


CARD_SPECS = [
    CardArtSpec("坠落", "fall", "top-down vertigo shot from the lip of a broken limestone shaft, camera looking straight down as an explorer falls away into a vast black cavern below, wide-angle lens, strong foreshortening, scattered cards and dust spiraling around him, dizzy vertical depth, non-graphic peril", True),
    CardArtSpec("解读石刻", "decipher_stone_carving", "close view of gloved hands tracing ancient carved symbols on a damp cave wall, torchlight revealing one chosen glyph while other carvings recede into darkness"),
    CardArtSpec("霉变食物", "moldy_food", "a damp ration tin and fungus-covered food on a stone ledge, sickly mold spores glowing faintly, dice half-buried in mud nearby, ominous but not gross"),
    CardArtSpec("腐臭", "stench", "a lower abyssal opening below a desert tomb, foul green vapor rising from unseen depths into a narrow stone chamber, travelers recoiling as silhouettes, inspired by a cursed Egyptian underworld descent"),
    CardArtSpec("遭遇塌方", "collapse", "a cave corridor collapsing in a storm of rocks and dust, one lantern spinning on the ground, figures scrambling away in shadow, powerful motion without visible injury"),
    CardArtSpec("亡者军团", "legion_of_the_dead", "an ancient pharaoh and ghoul queen leading a procession of human and animal-headed mummies through black onyx fissures under the pyramids, vast cursed undead army, non-graphic desiccated forms"),
    CardArtSpec("目击尸体", "witness_corpse", "an archaeologist frozen at the edge of a torchlit chamber after discovering a shrouded ancient body on a stone slab, sanity-check dread, non-graphic"),
    CardArtSpec("磷火", "will_o_wisp", "pale green phosphorescent fire drifting over bones and wet rocks in a subterranean passage, ghostly chemistry glow, distant silhouettes made small by the cavern"),
    CardArtSpec("无尽通道", "endless_corridor", "a narrow passage descending endlessly like a haunted vertical well, a raised torch failing to light the unknown depth, repeating stone walls vanishing into blackness"),
    CardArtSpec("可生食木乃伊", "raw_mummy", "a sealed tomb pantry with ancient mummy-wrapped provisions on a stone tray, wary explorer reaching toward it, dry linen and ritual jars, strange survival-horror still life"),
    CardArtSpec("绮丽诗篇", "gorgeous_poem", "a harp-playing bard in a dim tavern cave outpost, adventurers forgetting their quarrel and dancing while elegant thieves move among them, lush candlelit fantasy scene"),
    CardArtSpec("邪恶壁画", "evil_mural", "close view inside a ruined nameless city chamber where the walls and ceiling are covered by ancient painted murals and shallow carved frescoes; crawling reptilian creatures appear only as pigments and relief figures on the wall surface, the mural itself is the main subject, no living monsters and no freestanding statues"),
    CardArtSpec("空谷传音", "echoing_valley", "a lonely cavern valley where sound ripples visibly through mist, tiny figures listening to voices from the rock, black openings repeating the echo"),
    CardArtSpec("掘墓", "grave_digging", "a lone digger opening a forgotten stone grave beneath tangled roots in an underground ruin, one forbidden idol-card glinting among soil and bones, non-graphic"),
    CardArtSpec("活埋", "buried_alive", "hands and a lantern barely visible in a freshly sealed burial pit inside a cave tomb, falling sand and stones, panic implied through composition, no gore", True),
    CardArtSpec("圣甲虫", "scarab", "a luminous sacred scarab crawling across a gold-and-basalt amulet in a wet cave shrine, soft healing glow, ancient Egyptian atmosphere"),
    CardArtSpec("忏悔独白", "confessional_monologue", "a weary cultist kneeling alone before a cracked cave altar, mask set aside, candlelight and remorse, renouncing a dark faith"),
    CardArtSpec("生命天平", "life_balance", "an ancient bronze balance scale in a cavern temple, one pan glowing with warm life light and the other heavy with dark red shadow, ritual tension"),
    CardArtSpec("幽闭恐惧", "claustrophobia", "a person trapped in an impossibly tight cave tunnel, wet rock pressing close from all sides, lantern flame shrinking, intense cave claustrophobia without gore", True),
    CardArtSpec("增殖的Z", "proliferating_z", "a swarm of glossy cockroaches multiplying from a cracked trading card on a cave floor, playful hidden duel-card homage without text, eerie green rim light"),
    CardArtSpec("新鲜空气", "fresh_air", "a group of exhausted cave explorers reaching a small opening where clean blue air pours into the darkness, relief after suffocating tunnels"),
    CardArtSpec("黑泥沼", "black_mire", "explorers trudging through a black muddy swamp toward red firelight and blurred hand-drum silhouettes, oppressive ritual atmosphere under impossible stars"),
    CardArtSpec("地动山摇", "earthquake", "an underground hall shaking apart, stalactites cracking, cards and dust thrown into the air, everyone losing grip in the tremor, no injuries shown"),
    CardArtSpec("投掷石块", "throw_stone", "a desperate explorer hurling a sharp limestone rock toward a sound in total cave darkness, arm frozen mid-throw, hearing-guided aim, unseen threat beyond torchlight"),
    CardArtSpec("逆流", "reverse_current", "a vast ocean current reversing direction under a moonless sea, swirling bioluminescent streams and bubbles, underwater abyssal current not a river"),
    CardArtSpec("猎获穴兽", "hunted_cave_beast", "hunters around a steaming cave-beast roast in a subterranean camp, rugged survival feast, warm firelight against damp black stone, non-graphic"),
    CardArtSpec("封入石棺", "sealed_sarcophagus", "a person being sealed inside a heavy stone sarcophagus in an ancient cave tomb, narrow last beam of light across frightened eyes, non-graphic", True),
    CardArtSpec("窒息矿坑", "suffocating_mine", "an abandoned mine tunnel with low oxygen, extinguishing lamps and exhausted silhouettes slumping against timber supports, choking dust, no injury details"),
    CardArtSpec("地刺陷阱", "spike_trap", "a hidden floor trap opening to reveal rows of stone spikes in a cave corridor, a boot stopping at the edge just in time, tense memory-test composition"),
    CardArtSpec("落井下石", "kicking_down_the_well", "a rope lowering an explorer too fast down a rough narrow shaft, walls scraping past, figures above as cruel silhouettes, inspired by a cursed pyramid descent"),
    CardArtSpec("两人一绳", "two_on_one_rope", "two cave explorers tied by one rescue rope across a dark chasm, the rope fraying under shared tension, dramatic teamwork and danger, no injuries"),
    CardArtSpec("关键拼图", "key_puzzle", "a missing puzzle shard glowing under a bed of cave dust and old expedition gear, hands uncovering the crucial piece among mundane clutter"),
    CardArtSpec("宝箱怪", "mimic_chest", "an ancient treasure chest in a cavern opening into a hungry monstrous mouth, coins scattered, fantasy mimic ambush, stylized horror without gore"),
    CardArtSpec("灵魂天平", "soul_balance", "a spectral balance scale weighing a blue human soul flame against a black stone in a cave shrine, eerie san-restoring glow with hidden cost"),
    CardArtSpec("活火山", "active_volcano", "a volcanic cavern erupting with lava light, tiny figures dwarfed by molten rivers and falling ash, destructive geologic power"),
    CardArtSpec("烤盲鱼", "grilled_blind_fish", "pale blind cave fish roasting over a small campfire beside an underground stream, hungry survivors watching the next dark tunnel"),
    CardArtSpec("石化配方", "petrifying_formula", "an alchemist's cave table with bubbling petrifying potion, countdown marks on parchment, a stone hand statue forming beside glass vials, sinister experiment"),
    CardArtSpec("地下泉", "underground_spring", "a crystal-clear underground spring reflecting torchlight in a silent cavern, cold water healing exhausted travelers, serene but dark"),
    CardArtSpec("目击食人族", "witness_cannibals", "an explorer hiding behind rock and witnessing a shadowy forbidden cave feast around a fire, tribal silhouettes only, horror implied without gore"),
    CardArtSpec("惊扰蝙蝠", "startled_bats", "a huge cloud of bats exploding from a cave ceiling around a dropped torch, motion blur wings and panic, no visible injury"),
    CardArtSpec("地磁反转", "geomagnetic_reversal", "a cave compass spinning wildly as floating iron filings and glowing magnetic field lines reverse around ancient stones"),
    CardArtSpec("龙之心", "dragon_heart", "a large ember-red dragon heart crystal pulsing on a basalt altar, healing warmth and ancient power, cavern treasure mood"),
    CardArtSpec("引燃火把", "ignite_torch", "hands striking a torch to life in a black cave, warm flame pushing back monstrous shadows and divine influence, survival focus"),
    CardArtSpec("地底天空", "underground_sky", "a tunnel opening onto an impossible subterranean world with a rolling pale blue luminous sky overhead, rocky wasteland below, awe and vertigo"),
    CardArtSpec("触底反弹", "bottom_bounce", "a falling explorer rebounding from a strange elastic abyss floor, cards flying upward in a surreal cave shaft, dark humor kept subtle"),
    CardArtSpec("半物质化", "semimaterialization", "a trained subterranean mystic shifting between matter and spirit, translucent body passing through wet stone, willpower altering flesh and energy"),
    CardArtSpec("夜风呼啸", "night_wind", "a violent night wind blasting out of the black mouth of a desert temple cave, sandstorm curling from the entrance under cold stars"),
    CardArtSpec("秤心仪式", "weighing_of_heart", "Anubis presiding over the ancient Egyptian weighing of the heart ceremony in a cavernous underworld hall, heart on one pan and feather on the other, solemn judgment"),
    CardArtSpec("活死人哨兵", "undead_sentinel", "a dead sentinel torso mounted before an underground gate, wrapped like an ancient punishment relic, no head or limbs visible, non-graphic statue-like horror"),
    CardArtSpec("钻地魔虫", "burrowing_worm", "a massive burrowing worm emerging from the earth, many probing tentacles and a swollen forward lump, subterranean pulp horror, no gore"),
    CardArtSpec("穴居人战争", "cave_dweller_war", "two clever cave-dweller clans facing off with stone tools and torch shields across a cavern bridge, tactical underground war, no gore"),
    CardArtSpec("荆棘山路", "thorny_mountain_road", "a steep twisting mountain path choked with thorns above a cave entrance, bright new day undercut by a sinister shadow moving through the hills"),
    CardArtSpec("群蛇陷阱", "snake_trap", "green salamander-like serpents slithering over burning ground while pterosaur-headed birds shriek above black coals, malicious trap fantasy, non-graphic"),
    CardArtSpec("火中取栗", "chestnut_from_fire", "a hand snatching a glowing chestnut-like treasure from ritual fire during a forbidden banquet, pain implied, smoky red cave hall"),
    CardArtSpec("灵龟卜祝", "turtle_divination", "an ancient turtle-shell divination ritual on a wet stone table, four revealed cards glowing in cracks, oracle light in a cave shrine"),
    CardArtSpec("先到先得", "first_come_first_served", "survivors around a cave table urgently choosing from newly revealed cards, hands reaching in order, tense but cooperative loot moment"),
    CardArtSpec("玫瑰倒刺", "rose_thorns", "a bouquet of black roses with sharp crimson thorns wrapped around a hand of cards, elegant curse gift, candlelit cavern garden"),
    CardArtSpec("鼠群", "rat_swarm", "rats running behind the padded walls of an ancestral room that opens into deeper underground horror, sleepless dread and countless tiny shadows"),
    CardArtSpec("偷吃龙蛋", "stealing_dragon_egg", "a rogue secretly cracking and eating a glowing dragon egg in a cavern nest while angry heat gathers in the darkness behind him"),
    CardArtSpec("白化生物", "albino_creature", "a pale cave creature with white hair and skin, deep black eyes set in an atrophied face, glimpsed by torchlight, uncanny but non-graphic", True),
    CardArtSpec("狂化", "berserk", "a cultist blindfolded by chaos, chained in a dark cave ritual circle, rage power burning red around him, self-control slipping"),
    CardArtSpec("扭伤", "sprain", "a cave explorer slipping on wet stone and clutching an ankle beside a dropped lantern, minor injury and lost momentum, no gore"),
    CardArtSpec("同归深渊", "same_abyss", "two rivals falling together into a black abyss while scattered cards drift between them, mutual ruin, vast cave depth, non-graphic"),
    CardArtSpec("鲜红夜宴", "crimson_night_banquet", "a crimson underground banquet table lit by red candles, guests gaining vitality while losing sanity, opulent and sinister, no gore"),
    CardArtSpec("斯芬克斯", "sphinx", "a weathered sphinx statue in a subterranean Egyptian chamber posing an impossible riddle over the top card of a deck, torchlit judgment"),
]


def http_json(method: str, path: str, data=None, timeout=20):
    body = None
    headers = {}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(f"{COMFY}{path}", data=body, headers=headers, method=method)
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_bytes(path: str, timeout=30):
    with request.urlopen(f"{COMFY}{path}", timeout=timeout) as resp:
        return resp.read()


def wait_for_output(prompt_id: str, timeout=420):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            history = http_json("GET", f"/history/{prompt_id}", timeout=10)
        except (error.URLError, TimeoutError):
            time.sleep(1)
            continue
        item = history.get(prompt_id)
        if item:
            status = item.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(json.dumps(status, ensure_ascii=False))
            for output in item.get("outputs", {}).values():
                for img in output.get("images", []):
                    qs = parse.urlencode({
                        "filename": img["filename"],
                        "subfolder": img.get("subfolder", ""),
                        "type": img.get("type", "output"),
                    })
                    return http_bytes(f"/view?{qs}", timeout=60)
        time.sleep(1)
    raise TimeoutError(prompt_id)


def build_prompt(spec: CardArtSpec) -> str:
    return (
        f"{STYLE_PROMPT}. "
        f"Scene: {spec.prompt}. "
        f"Composition: {'vertical close-up cinematic crop' if spec.portrait else 'wide rectangular cinematic crop'}, "
        "keep the main subject centered and recognizable after a wide crop. "
        "The scene itself must touch all four canvas edges; it is not a printed photo, not a framed picture, "
        "not a card, and not a letterboxed movie frame. "
        f"Negative prompt: {AVOID_PROMPT}."
    )


def make_workflow(spec: CardArtSpec, seed: int):
    latent_w, latent_h = PORTRAIT_LATENT_SIZE if spec.portrait else LANDSCAPE_LATENT_SIZE
    out_w, out_h = PORTRAIT_SOURCE_SIZE if spec.portrait else LANDSCAPE_SOURCE_SIZE
    prompt = build_prompt(spec)
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_fp8_e4m3fn.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "VAELoader", "inputs": {"vae_name": "flux_vae.safetensors"}},
        "3": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "4": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": "Qwen3-4B-Q4_K_M.gguf", "type": "lumina2"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": AVOID_PROMPT}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": latent_w, "height": latent_h, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["3", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "seed": seed, "steps": 10, "cfg": 2.5, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["2", 0]}},
        "10": {"class_type": "ImageScale", "inputs": {"image": ["9", 0], "upscale_method": "lanczos", "width": out_w, "height": out_h, "crop": "disabled"}},
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": f"zone_art/{spec.slug}"}},
    }


def trim_matte_margin(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    gray = rgb.convert("L")

    nonwhite_x = []
    nonwhite_y = []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            bright_neutral_matte = (
                r > 180
                and g > 180
                and b > 180
                and max(r, g, b) - min(r, g, b) < 34
            )
            dark_neutral_matte = r < 24 and g < 24 and b < 24
            if not (bright_neutral_matte or dark_neutral_matte):
                nonwhite_x.append(x)
                nonwhite_y.append(y)
    if nonwhite_x and nonwhite_y:
        left = min(nonwhite_x)
        right = max(nonwhite_x)
        top = min(nonwhite_y)
        bottom = max(nonwhite_y)
    else:
        left = 0
        right = w - 1
        top = 0
        bottom = h - 1
    bbox_left, bbox_right, bbox_top, bbox_bottom = left, right, top, bottom

    def is_matte_col(x: int) -> bool:
        strip = rgb.crop((x, 0, x + 1, h)).convert("L")
        stat = ImageStat.Stat(strip)
        mean = stat.mean[0]
        std = stat.stddev[0]
        light_hits = 0
        dark_hits = 0
        for y in range(h):
            r, g, b = px[x, y]
            lum = (r + g + b) / 3
            if r > 200 and g > 200 and b > 200:
                light_hits += 1
            if lum < 18:
                dark_hits += 1
        return light_hits / h > 0.50 or dark_hits / h > 0.70 or (std < 24 and (mean > 168 or mean < 30))

    def is_matte_row(y: int) -> bool:
        strip = rgb.crop((0, y, w, y + 1)).convert("L")
        stat = ImageStat.Stat(strip)
        mean = stat.mean[0]
        std = stat.stddev[0]
        light_hits = 0
        dark_hits = 0
        for x in range(w):
            r, g, b = px[x, y]
            lum = (r + g + b) / 3
            if r > 200 and g > 200 and b > 200:
                light_hits += 1
            if lum < 18:
                dark_hits += 1
        return light_hits / w > 0.50 or dark_hits / w > 0.70 or (std < 24 and (mean > 168 or mean < 30))

    while left < w * 0.35 and is_matte_col(left):
        left += 1
    while right > w * 0.65 and is_matte_col(right):
        right -= 1
    while top < h * 0.35 and is_matte_row(top):
        top += 1
    while bottom > h * 0.65 and is_matte_row(bottom):
        bottom -= 1

    if left or top or right < w - 1 or bottom < h - 1:
        pad = 4
        left = max(0, left - pad)
        top = max(0, top - pad)
        right = min(w - 1, right + pad)
        bottom = min(h - 1, bottom + pad)

    def row_has_detail(y: int) -> bool:
        strip = gray.crop((left, y, right + 1, y + 1))
        stat = ImageStat.Stat(strip)
        values = list(strip.getdata())
        bright = sum(1 for v in values if v > 215) / len(values)
        dark = sum(1 for v in values if v < 18) / len(values)
        return stat.stddev[0] > 7.5 and stat.mean[0] > 4 and bright < 0.42 and dark < 0.78

    def col_has_detail(x: int) -> bool:
        strip = gray.crop((x, top, x + 1, bottom + 1))
        stat = ImageStat.Stat(strip)
        values = list(strip.getdata())
        bright = sum(1 for v in values if v > 215) / len(values)
        dark = sum(1 for v in values if v < 18) / len(values)
        return stat.stddev[0] > 7.5 and stat.mean[0] > 4 and bright < 0.42 and dark < 0.78

    def first_detail_row(start: int, stop: int, step: int) -> int:
        y = start
        while 0 <= y < h and (y <= stop if step > 0 else y >= stop):
            window = range(y, min(h, y + 18)) if step > 0 else range(max(0, y - 17), y + 1)
            if sum(1 for yy in window if row_has_detail(yy)) >= 10:
                return y if step > 0 else y
            y += step
        return start

    def first_detail_col(start: int, stop: int, step: int) -> int:
        x = start
        while 0 <= x < w and (x <= stop if step > 0 else x >= stop):
            window = range(x, min(w, x + 18)) if step > 0 else range(max(0, x - 17), x + 1)
            if sum(1 for xx in window if col_has_detail(xx)) >= 10:
                return x if step > 0 else x
            x += step
        return start

    top = max(top, first_detail_row(0, int(h * 0.40), 1) - 4)
    bottom = min(bottom, first_detail_row(h - 1, int(h * 0.60), -1) + 4)
    left = max(left, first_detail_col(0, int(w * 0.35), 1) - 4)
    right = min(right, first_detail_col(w - 1, int(w * 0.65), -1) + 4)

    top = max(0, top)
    left = max(0, left)
    bottom = min(h - 1, bottom)
    right = min(w - 1, right)
    if right - left < w * 0.45 or bottom - top < h * 0.45:
        left, right, top, bottom = bbox_left, bbox_right, bbox_top, bbox_bottom
        if right - left < w * 0.35 or bottom - top < h * 0.35:
            return rgb
    return rgb.crop((left, top, right + 1, bottom + 1))


def generate_one(spec: CardArtSpec, client_id: str, overwrite: bool) -> bool:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / f"{spec.slug}.png"
    if target.exists() and not overwrite:
        print(f"skip existing: {spec.name} -> {target.name}")
        return False

    seed = 830000 + random.Random(spec.slug).randrange(100000)
    workflow = make_workflow(spec, seed)
    prompt_id = http_json("POST", "/prompt", {"prompt": workflow, "client_id": client_id}, timeout=20)["prompt_id"]
    source_bytes = wait_for_output(prompt_id)
    image = trim_matte_margin(Image.open(io.BytesIO(source_bytes)))
    image = finalize_image(image, spec)
    image.save(target, "PNG", optimize=True)
    print(f"generated: {spec.name} -> {target.name} ({image.size[0]}x{image.size[1]})")
    return True


def finalize_image(image: Image.Image, spec: CardArtSpec) -> Image.Image:
    expected = PORTRAIT_SOURCE_SIZE if spec.portrait else LANDSCAPE_SOURCE_SIZE
    if image.size != expected:
        image = ImageOps.fit(image, expected, Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    edge_x = max(1, int(expected[0] * 0.015))
    edge_y = max(1, int(expected[1] * 0.015))
    image = image.crop((edge_x, edge_y, expected[0] - edge_x, expected[1] - edge_y))
    return image.resize(expected, Image.Resampling.LANCZOS)


def postprocess_existing(spec: CardArtSpec) -> bool:
    target = OUT_DIR / f"{spec.slug}.png"
    if not target.exists():
        print(f"missing: {spec.name} -> {target.name}")
        return False
    image = trim_matte_margin(Image.open(target))
    image = finalize_image(image, spec)
    image.save(target, "PNG", optimize=True)
    print(f"postprocessed: {spec.name} -> {target.name} ({image.size[0]}x{image.size[1]})")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="Generate only these Chinese names or slugs.")
    parser.add_argument("--limit", type=int, default=0, help="Generate at most N missing images.")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--postprocess-existing", action="store_true")
    args = parser.parse_args()

    selected = CARD_SPECS
    if args.only:
        wanted = set(args.only)
        selected = [spec for spec in selected if spec.name in wanted or spec.slug in wanted]
    if args.limit > 0:
        pending = [spec for spec in selected if args.overwrite or not (OUT_DIR / f"{spec.slug}.png").exists()]
        selected = pending[: args.limit]

    if args.postprocess_existing:
        made = 0
        for spec in selected:
            if postprocess_existing(spec):
                made += 1
        print(f"done: postprocessed {made}, checked {len(selected)}")
        return

    try:
        http_json("GET", "/system_stats", timeout=5)
    except Exception as exc:
        raise SystemExit(f"ComfyUI is not reachable at {COMFY}: {exc}") from exc

    client_id = str(uuid.uuid4())
    made = 0
    for spec in selected:
        if generate_one(spec, client_id, args.overwrite):
            made += 1
    print(f"done: generated {made}, checked {len(selected)}")


if __name__ == "__main__":
    main()
