import type { FurnitureVariant } from "../spatial/model";
import bathtub from "../../assets/furniture/bathtub.glb";
import bathroomSink from "../../assets/furniture/bathroomSinkSquare.glb";
import bed from "../../assets/furniture/bedDouble.glb";
import chair from "../../assets/furniture/chair.glb";
import deskChair from "../../assets/furniture/chairDesk.glb";
import desk from "../../assets/furniture/desk.glb";
import counter from "../../assets/furniture/kitchenCabinet.glb";
import fridge from "../../assets/furniture/kitchenFridge.glb";
import sink from "../../assets/furniture/kitchenSink.glb";
import stove from "../../assets/furniture/kitchenStove.glb";
import sofa from "../../assets/furniture/loungeSofa.glb";
import armchair from "../../assets/furniture/loungeChair.glb";
import floorLamp from "../../assets/furniture/lampRoundFloor.glb";
import plant from "../../assets/furniture/pottedPlant.glb";
import rug from "../../assets/furniture/rugRectangle.glb";
import rugRound from "../../assets/furniture/rugRound.glb";
import nightstand from "../../assets/furniture/sideTableDrawers.glb";
import coffeeTable from "../../assets/furniture/tableCoffee.glb";
import diningTable from "../../assets/furniture/table.glb";
import toilet from "../../assets/furniture/toilet.glb";
import tvStand from "../../assets/furniture/cabinetTelevisionDoors.glb";
import shower from "../../assets/furniture/showerRound.glb";
import wardrobe from "../../assets/furniture/bookcaseClosedDoors.glb";

/**
 * Metro resolves each import to the DOM bundle's asset path. The map is
 * exhaustive so a new variant cannot silently render only a fallback volume.
 */
export const furnitureAssets: Record<FurnitureVariant, string> = {
  sofa,
  armchair,
  coffeeTable,
  diningTable,
  chair,
  desk,
  deskChair,
  tvStand,
  floorLamp,
  plant,
  rug,
  rugRound,
  counter,
  stove,
  sink,
  fridge,
  bed,
  nightstand,
  wardrobe,
  bathroomSink,
  toilet,
  bathtub,
  shower,
};
