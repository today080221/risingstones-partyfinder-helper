export const productDisplayName = "阿谢姆水晶（Azem's Crystal）";

export function releaseTargetName(version, target) {
  return `${productDisplayName}-v${version}-${target}`;
}

export function productExecutableName() {
  return `${productDisplayName}.exe`;
}
