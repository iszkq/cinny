import React, {
  FormEventHandler,
  KeyboardEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MatrixError } from 'matrix-js-sdk';
import { Box, color, Icon, Icons, Input, Spinner, Text, toRem } from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import { getMxIdServer } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { replaceSpaceWithDash } from '../../utils/common';
import { AsyncState, AsyncStatus, useAsync } from '../../hooks/useAsyncCallback';
import { useDebounce } from '../../hooks/useDebounce';

export function CreateRoomAliasInput({ disabled }: { disabled?: boolean }) {
  const mx = useMatrixClient();
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const [aliasAvail, setAliasAvail] = useState<AsyncState<boolean, Error>>({
    status: AsyncStatus.Idle,
  });

  useEffect(() => {
    if (aliasAvail.status === AsyncStatus.Success && aliasInputRef.current?.value === '') {
      setAliasAvail({ status: AsyncStatus.Idle });
    }
  }, [aliasAvail]);

  const checkAliasAvail = useAsync(
    useCallback(
      async (aliasLocalPart: string) => {
        const roomAlias = `#${aliasLocalPart}:${getMxIdServer(mx.getSafeUserId())}`;
        try {
          const result = await mx.getRoomIdForAlias(roomAlias);
          return typeof result.room_id !== 'string';
        } catch (e) {
          if (e instanceof MatrixError && e.httpStatus === 404) {
            return true;
          }
          throw e;
        }
      },
      [mx]
    ),
    setAliasAvail
  );
  const aliasAvailable: boolean | undefined =
    aliasAvail.status === AsyncStatus.Success ? aliasAvail.data : undefined;

  const debounceCheckAliasAvail = useDebounce(checkAliasAvail, { wait: 500 });

  const handleAliasChange: FormEventHandler<HTMLInputElement> = (evt) => {
    const aliasInput = evt.currentTarget;
    const aliasLocalPart = replaceSpaceWithDash(aliasInput.value);
    if (aliasLocalPart) {
      aliasInput.value = aliasLocalPart;
      debounceCheckAliasAvail(aliasLocalPart);
    } else {
      setAliasAvail({ status: AsyncStatus.Idle });
    }
  };

  const handleAliasKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('enter', evt)) {
      evt.preventDefault();

      const aliasInput = evt.currentTarget;
      const aliasLocalPart = replaceSpaceWithDash(aliasInput.value);
      if (aliasLocalPart) {
        checkAliasAvail(aliasLocalPart);
      } else {
        setAliasAvail({ status: AsyncStatus.Idle });
      }
    }
  };

  return (
    <Box shrink="No" direction="Column" gap="100">
      <Text size="L400">{'\u5730\u5740\uff08\u53ef\u9009\uff09'}</Text>
      <Text size="T200" priority="300">
        {'\u9009\u62e9\u4e00\u4e2a\u552f\u4e00\u5730\u5740\uff0c\u65b9\u4fbf\u88ab\u53d1\u73b0\u3002'}
      </Text>
      <Input
        ref={aliasInputRef}
        onChange={handleAliasChange}
        before={
          aliasAvail.status === AsyncStatus.Loading ? (
            <Spinner size="100" variant="Secondary" />
          ) : (
            <Icon size="100" src={Icons.Hash} />
          )
        }
        after={
          <Text style={{ maxWidth: toRem(150) }} truncate>
            :{getMxIdServer(mx.getSafeUserId())}
          </Text>
        }
        onKeyDown={handleAliasKeyDown}
        name="aliasInput"
        size="500"
        variant={aliasAvailable === true ? 'Success' : 'SurfaceVariant'}
        radii="400"
        autoComplete="off"
        disabled={disabled}
      />
      {aliasAvailable === false && (
        <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
          <Icon src={Icons.Warning} filled size="50" />
          <Text size="T200">
            <b>{'\u8be5\u5730\u5740\u5df2\u88ab\u5360\u7528\uff0c\u8bf7\u6362\u4e00\u4e2a\u8bd5\u8bd5\u3002'}</b>
          </Text>
        </Box>
      )}
    </Box>
  );
}
