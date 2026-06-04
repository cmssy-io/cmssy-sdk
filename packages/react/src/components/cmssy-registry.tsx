import { registerBlocks, type BlockDefinition } from "../registry";

export interface CmssyRegistryProps {
  blocks: BlockDefinition[];
  category?: string;
}

export function CmssyRegistry({ blocks, category }: CmssyRegistryProps): null {
  registerBlocks(blocks, { category });
  return null;
}
