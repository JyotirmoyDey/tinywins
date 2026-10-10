import Svg, { Circle, Path } from 'react-native-svg';
import { colors as c } from '../theme';

export function FirstActivityIcon({ exampleId }: { exampleId: string }) {
  const stroke = c.textSecondary;
  return <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" accessible={false}>
    {exampleId === 'exercise' && <Path d="M3 9v6m3-8v10m12-10v10m3-8v6M6 12h12"
      stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />}
    {exampleId === 'reading' && <Path d="M12 6c-2.4-1.5-5.3-1.9-9-1v14c3.7-.9 6.6-.5 9 1 2.4-1.5 5.3-1.9 9-1V5c-3.7-.9-6.6-.5-9 1Zm0 0v14"
      stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />}
    {exampleId === 'music-practice' && <>
      <Path d="M9 18V5l12-2v13M9 9l12-2" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={6} cy={18} r={3} stroke={stroke} strokeWidth={1.7} />
      <Circle cx={18} cy={16} r={3} stroke={stroke} strokeWidth={1.7} />
    </>}
    {exampleId === 'learning' && <Path d="M12 5c-2-2-5-1.5-6 .5-2-.1-3.5 1.7-3 3.5-1.5 1.5-1 3.5.5 4.5-.7 2.5 1.3 4.5 3.5 4.5 1.2 1.9 4.4 1.5 5-.5 1.2 2 4.4 2.4 5 .5 2.2 0 4.2-2 3.5-4.5 1.5-1 2-3 .5-4.5.5-1.8-1-3.6-3-3.5-1-2-4-2.5-6-.5v13M6 9c2 0 3 1 3 3m9-3c-2 0-3 1-3 3"
      stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />}
  </Svg>;
}
