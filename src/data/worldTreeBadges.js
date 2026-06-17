import seedPioneerImage     from "../assets/badges/seed-pioneer.png";
import natureGuardianImage  from "../assets/badges/nature-guardian.png";
import treeKeeperImage      from "../assets/badges/tree-keeper.png";
import forestProtectorImage from "../assets/badges/forest-protector.png";
import memoryGuardianImage  from "../assets/badges/memory-guardian.png";

const worldTreeBadges = [
  {
    level:       5,
    key:         "seed_pioneer",
    name:        "Seed Pioneer",
    image:       seedPioneerImage,
    description: "Reached World Tree Level 5",
  },
  {
    level:       10,
    key:         "nature_guardian",
    name:        "Nature Guardian",
    image:       natureGuardianImage,
    description: "Reached World Tree Level 10",
  },
  {
    level:       15,
    key:         "tree_keeper",
    name:        "Tree Keeper",
    image:       treeKeeperImage,
    description: "Reached World Tree Level 15",
  },
  {
    level:       20,
    key:         "forest_protector",
    name:        "Forest Protector",
    image:       forestProtectorImage,
    description: "Reached World Tree Level 20",
  },
  {
    level:       25,
    key:         "memory_guardian",
    name:        "Memory Guardian",
    image:       memoryGuardianImage,
    description: "Reached World Tree Level 25",
  },
];

export default worldTreeBadges;
